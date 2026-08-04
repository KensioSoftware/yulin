import type { SimDynamoDbEventSourceStreamShard } from "./sim-dynamodb-event-source-stream-shard.js";
import { simDynamoDbEventSourceNextPosition } from "./sim-dynamodb-event-source-stream-positions.js";
import type { SimLambdaEventSourceStreamCommands } from "./sim-lambda-event-source-stream-service.js";
import type {
  SimLambdaEventSourceStreamBatch,
  SimLambdaEventSourceStreamReadRequest,
} from "./sim-lambda-event-source-streams.js";

interface SimDynamoDbEventSourceStreamReaderProperties {
  readonly commands: SimLambdaEventSourceStreamCommands;
  readonly shard: SimDynamoDbEventSourceStreamShard;
}

/**
 * Reads batches of records off the shard a mapping polls.
 *
 * The iterator a read hands back is the place to carry on from, and a caller
 * that does not take it reads the same records again. That is what makes a
 * failed batch go over again from where it was rather than being skipped, and
 * what makes a batch item failure report able to send the reader back to a
 * record it has already been given.
 */
export class SimDynamoDbEventSourceStreamReader {
  private readonly commands: SimLambdaEventSourceStreamCommands;
  private readonly shard: SimDynamoDbEventSourceStreamShard;

  constructor(properties: SimDynamoDbEventSourceStreamReaderProperties) {
    this.commands = properties.commands;
    this.shard = properties.shard;
  }

  /**
   * Read up to a batch of records from where a position left off.
   */
  async read(
    request: SimLambdaEventSourceStreamReadRequest,
  ): Promise<SimLambdaEventSourceStreamBatch> {
    const { batchSize, caller, position } = request;
    const output = await this.commands.getRecords(
      {
        input: {
          ShardIterator: await this.iteratorOf(request),
          Limit: batchSize,
        },
      },
      { caller },
    );
    const next = output.NextShardIterator;

    return {
      records: output.Records ?? [],
      next: simDynamoDbEventSourceNextPosition(next, position),
      drained: next === undefined,
    };
  }

  /**
   * The place a read starts from: the one the caller already has, or one the
   * stream is asked for when the caller names a place instead.
   */
  private async iteratorOf(
    request: SimLambdaEventSourceStreamReadRequest,
  ): Promise<string> {
    const { position } = request;

    if (position.kind === "iterator") {
      return position.shardIterator;
    }

    return await this.shard.iteratorFor(request, position);
  }
}
