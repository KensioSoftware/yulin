import type { SimAwsCaller } from "../../../../aws/caller/sim-aws-caller.js";
import type {
  SimLambdaEventSourceStreamPosition,
  SimLambdaEventSourceStreamProgressBatch,
  SimLambdaEventSourceStreamRequest,
  SimLambdaEventSourceStreamWatcher,
} from "../sim-lambda-event-source-streams.js";

/**
 * One record as a Kinesis stream hands it to a poller.
 *
 * These are the Kinesis API's own names for the parts of a record. Turning them
 * into the event a function sees is the event builder's job, and it is a real
 * translation rather than a copy: the API gives raw bytes and an instant where
 * the event gives base64 and epoch seconds.
 */
export interface SimLambdaKinesisStreamRecord {
  readonly SequenceNumber?: string | undefined;
  readonly ApproximateArrivalTimestamp?: Date | undefined;
  readonly Data?: Uint8Array | undefined;
  readonly PartitionKey?: string | undefined;
}

/**
 * A poller's read of one shard, made as the function's execution role.
 *
 * A Kinesis stream has as many shards as it was created with, so which shard is
 * being read is part of the request. That is the difference from the DynamoDB
 * stream reader, where the stream has one shard and the poller never names it.
 */
export interface SimLambdaKinesisShardReadRequest extends SimLambdaEventSourceStreamRequest {
  readonly shardId: string;
  readonly position: SimLambdaEventSourceStreamPosition;
  readonly batchSize: number;
}

/**
 * What one read of a shard came back with.
 */
export interface SimLambdaKinesisStreamBatch extends SimLambdaEventSourceStreamProgressBatch {
  readonly records: readonly SimLambdaKinesisStreamRecord[];
}

/**
 * The Kinesis streams a simulated Lambda event source mapping polls.
 *
 * This is the narrow slice of simulated Kinesis that polling needs, kept as an
 * interface so Lambda depends on what it does with a stream rather than on the
 * Kinesis service object. Every operation carries the caller, because polling
 * on real Lambda is done with the function's execution role and is refused when
 * that role has no permission for it.
 */
export interface SimLambdaKinesisStreams {
  /**
   * The shards of a stream, and by asking, whether the stream is there to be
   * polled at all.
   *
   * A mapping reads every shard, so it needs all of them rather than one.
   */
  shardIds(
    request: SimLambdaEventSourceStreamRequest,
  ): Promise<readonly string[]>;

  /**
   * Read up to a batch of records from where a position left off on one shard.
   */
  read(
    request: SimLambdaKinesisShardReadRequest,
  ): Promise<SimLambdaKinesisStreamBatch>;

  /**
   * Watch a stream for the records put onto it.
   */
  watch(streamArn: string, watcher: SimLambdaEventSourceStreamWatcher): void;

  /**
   * Stop watching a stream.
   */
  unwatch(streamArn: string, watcher: SimLambdaEventSourceStreamWatcher): void;
}

/**
 * What a Kinesis request carries besides its command input.
 */
export interface SimLambdaKinesisCallerOptions {
  readonly caller: SimAwsCaller;
}
