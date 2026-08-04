import { SimLambdaError } from "../../error/sim-lambda.error.js";
import type {
  SimLambdaEventSourceStreamCommands,
  SimLambdaEventSourceStreamDescription,
} from "./sim-lambda-event-source-stream-service.js";
import type { SimLambdaEventSourceStartingPosition } from "../sim-lambda-event-source-starting-position.js";
import type {
  SimLambdaEventSourceStreamBatch,
  SimLambdaEventSourceStreamReadRequest,
  SimLambdaEventSourceStreamRequest,
} from "./sim-lambda-event-source-streams.js";

/**
 * What DescribeStream tells a poller about the stream it is about to read.
 *
 * Both answers come from the same call, which is why they are together: the
 * table a stream carries changes for, and the shard those changes are on. A
 * mapping asks for the table once, when it is created, and for a place on the
 * shard whenever it has nowhere to carry on from.
 */
export class SimDynamoDbEventSourceStreamShard {
  private readonly commands: SimLambdaEventSourceStreamCommands;

  constructor(commands: SimLambdaEventSourceStreamCommands) {
    this.commands = commands;
  }

  /**
   * The table whose changes a stream carries.
   */
  async tableName(request: SimLambdaEventSourceStreamRequest): Promise<string> {
    const described = await this.describe(request);
    const tableName = described.TableName;

    if (tableName === undefined) {
      refuse(request, "reports no table to poll changes from");
    }

    return tableName;
  }

  /**
   * A place on the shard to start reading from.
   *
   * A simulated stream has one shard, so the first shard DescribeStream reports
   * is the shard.
   */
  async iteratorFor(
    request: SimLambdaEventSourceStreamRequest,
    startingPosition: SimLambdaEventSourceStartingPosition,
  ): Promise<string> {
    const { caller, streamArn } = request;
    const description = await this.describe(request);
    const shardId = description.Shards?.[0]?.ShardId;

    if (shardId === undefined) {
      refuse(request, "reports no shard to read records from");
    }

    const iterator = await this.commands.getShardIterator(
      {
        input: {
          StreamArn: streamArn,
          ShardId: shardId,
          ShardIteratorType: startingPosition,
        },
      },
      { caller },
    );

    if (iterator.ShardIterator === undefined) {
      refuse(request, "gave out no shard iterator");
    }

    return iterator.ShardIterator;
  }

  /**
   * Read up to a batch of records from where a position left off.
   *
   * The iterator the read hands back is the place to carry on from, and a
   * caller that does not take it reads the same records again. That is what
   * makes a failed batch retry from where it was rather than being skipped.
   */
  async read(
    request: SimLambdaEventSourceStreamReadRequest,
  ): Promise<SimLambdaEventSourceStreamBatch> {
    const { batchSize, caller, position } = request;
    const shardIterator = await this.iteratorOf(request);
    const output = await this.commands.getRecords(
      { input: { ShardIterator: shardIterator, Limit: batchSize } },
      { caller },
    );
    const next = output.NextShardIterator;

    return {
      records: output.Records ?? [],
      // A shard with no next iterator is finished with, so there is nowhere to
      // carry on from and the position handed in stands.
      next:
        next === undefined
          ? position
          : { kind: "iterator", shardIterator: next },
      drained: next === undefined,
    };
  }

  /**
   * The place a read starts from: the one the caller already has, or a new one
   * for a mapping that has only its starting position.
   */
  private async iteratorOf(
    request: SimLambdaEventSourceStreamReadRequest,
  ): Promise<string> {
    const { position } = request;

    if (position.kind === "iterator") {
      return position.shardIterator;
    }

    return await this.iteratorFor(request, position.startingPosition);
  }

  private async describe(
    request: SimLambdaEventSourceStreamRequest,
  ): Promise<SimLambdaEventSourceStreamDescription> {
    const { caller, streamArn } = request;
    const described = await this.commands.describeStream(
      { input: { StreamArn: streamArn } },
      { caller },
    );

    if (described.StreamDescription === undefined) {
      refuse(request, "could not be described");
    }

    return described.StreamDescription;
  }
}

/**
 * Refuse a stream that answered with something a poller cannot read on from.
 *
 * Nothing simulated DynamoDB answers with reaches these, since a stream it
 * resolved by ARN has a table and a shard. They are here because the port is
 * shaped as the SDK shapes it, where every part of an answer is optional.
 */
function refuse(
  request: SimLambdaEventSourceStreamRequest,
  problem: string,
): never {
  throw new SimLambdaError(`Stream ${request.streamArn} ${problem}`);
}
