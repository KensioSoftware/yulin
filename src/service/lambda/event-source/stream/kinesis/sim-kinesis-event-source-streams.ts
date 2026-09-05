import { SimKinesisEventSourceShards } from "./sim-kinesis-event-source-shards.js";
import { simKinesisEventSourceIteratorTypeOf } from "./sim-kinesis-event-source-positions.js";
import type {
  SimLambdaKinesisStreamActivity,
  SimLambdaKinesisStreamCommands,
  SimLambdaKinesisStreamService,
} from "./sim-lambda-kinesis-stream-service.js";
import type {
  SimLambdaKinesisShardReadRequest,
  SimLambdaKinesisStreamBatch,
  SimLambdaKinesisStreams,
} from "./sim-lambda-kinesis-streams.js";
import type {
  SimLambdaEventSourceStreamRequest,
  SimLambdaEventSourceStreamWatcher,
} from "../sim-lambda-event-source-streams.js";

interface SimKinesisEventSourceStreamsProperties {
  readonly kinesis: SimLambdaKinesisStreamService;
}

/**
 * Simulated Kinesis as the streams a Lambda event source mapping polls.
 *
 * Every call goes through the Kinesis command it would go through on real AWS,
 * as the function's execution role, so a role without `kinesis:DescribeStream`,
 * `kinesis:GetShardIterator` or `kinesis:GetRecords` on the stream is refused
 * here rather than quietly polling anyway.
 */
export class SimKinesisEventSourceStreams implements SimLambdaKinesisStreams {
  private readonly commands: SimLambdaKinesisStreamCommands;
  private readonly activity: SimLambdaKinesisStreamActivity;
  private readonly shards: SimKinesisEventSourceShards;

  constructor(properties: SimKinesisEventSourceStreamsProperties) {
    const { kinesis } = properties;

    this.commands = kinesis;
    this.activity = kinesis.streamActivity();
    this.shards = new SimKinesisEventSourceShards(kinesis);
  }

  /**
   * Every shard of a stream, which is what a mapping reads across.
   */
  async shardIds(
    request: SimLambdaEventSourceStreamRequest,
  ): Promise<readonly string[]> {
    return await this.shards.shardIds(request);
  }

  /**
   * Read up to a batch of records from where a position left off on one shard.
   *
   * A Kinesis shard never closes here, since nothing reshards, so a read always
   * hands back somewhere to carry on from and a shard is never drained.
   */
  async read(
    request: SimLambdaKinesisShardReadRequest,
  ): Promise<SimLambdaKinesisStreamBatch> {
    const { batchSize, caller } = request;
    const output = await this.commands.getRecords(
      {
        input: {
          ShardIterator: await this.iteratorOf(request),
          Limit: batchSize,
        },
      },
      { caller },
    );

    return {
      records: output.Records,
      shardId: request.shardId,
      next: { kind: "iterator", shardIterator: output.NextShardIterator },
      drained: false,
    };
  }

  /**
   * Watch a stream for the records put onto it.
   */
  watch(streamArn: string, watcher: SimLambdaEventSourceStreamWatcher): void {
    this.activity.watch(streamArn, watcher);
  }

  /**
   * Stop watching a stream.
   */
  unwatch(streamArn: string, watcher: SimLambdaEventSourceStreamWatcher): void {
    this.activity.unwatch(streamArn, watcher);
  }

  /**
   * The place a read starts from: the one the caller already has, or one the
   * stream is asked for when the caller names a place instead.
   */
  private async iteratorOf(
    request: SimLambdaKinesisShardReadRequest,
  ): Promise<string> {
    const { position } = request;

    if (position.kind === "iterator") {
      return position.shardIterator;
    }

    const iterator = await this.commands.getShardIterator(
      {
        input: {
          StreamARN: request.streamArn,
          ShardId: request.shardId,
          ...simKinesisEventSourceIteratorTypeOf(position),
        },
      },
      { caller: request.caller },
    );

    return iterator.ShardIterator;
  }
}
