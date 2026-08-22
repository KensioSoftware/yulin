import type { SimLambdaEventSourceStreamPosition } from "../../stream/sim-lambda-event-source-streams.js";
import type {
  SimLambdaKinesisStreamBatch,
  SimLambdaKinesisStreams,
} from "../../stream/kinesis/sim-lambda-kinesis-streams.js";

interface SimLambdaKinesisPolledShardProperties {
  readonly streams: SimLambdaKinesisStreams;
  readonly streamArn: string;
  readonly shardId: string;
  readonly roleArn: string;
}

/**
 * The one shard a shard poller reads.
 *
 * Every call names the same stream and the same shard, and all of them are made
 * as the function's execution role, so all three are fixed here rather than
 * written out at each call. Simulated IAM still decides each one, exactly as
 * real IAM does.
 */
export class SimLambdaKinesisPolledShard {
  private readonly streams: SimLambdaKinesisStreams;
  private readonly streamArn: string;
  private readonly shardId: string;
  private readonly roleArn: string;

  constructor(properties: SimLambdaKinesisPolledShardProperties) {
    this.streams = properties.streams;
    this.streamArn = properties.streamArn;
    this.shardId = properties.shardId;
    this.roleArn = properties.roleArn;
  }

  /**
   * Read up to a batch of records from where the mapping left off.
   */
  async read(
    position: SimLambdaEventSourceStreamPosition,
    batchSize: number,
  ): Promise<SimLambdaKinesisStreamBatch> {
    return await this.streams.read({
      streamArn: this.streamArn,
      caller: { kind: "arn", arn: this.roleArn },
      shardId: this.shardId,
      position,
      batchSize,
    });
  }
}
