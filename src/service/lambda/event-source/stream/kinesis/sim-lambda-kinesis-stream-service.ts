import type { SimLambdaKinesisCallerOptions } from "./sim-lambda-kinesis-streams.js";
import type { SimLambdaKinesisStreamRecord } from "./sim-lambda-kinesis-streams.js";
import type { SimLambdaEventSourceStreamWatcher } from "../sim-lambda-event-source-streams.js";

/**
 * One shard of a stream, as DescribeStream reports it.
 */
interface KinesisShardDescription {
  readonly ShardId?: string | undefined;
}

/**
 * A stream, as DescribeStream reports it.
 */
export interface SimLambdaKinesisStreamDescription {
  readonly Shards?: readonly KinesisShardDescription[] | undefined;
  readonly HasMoreShards?: boolean | undefined;
}

/**
 * The Kinesis commands a poller reads a stream with.
 *
 * These are the SDK operations a real poller performs, in the order it performs
 * them: find the shards, ask for a place on one, then read from there. Going
 * through the commands rather than through a read interface of Yulin's own is
 * what makes each call authorize as the function's execution role.
 */
export interface SimLambdaKinesisStreamCommands {
  describeStream(
    command: {
      input: {
        StreamARN: string;
        Limit?: number;
        ExclusiveStartShardId?: string;
      };
    },
    options?: SimLambdaKinesisCallerOptions,
  ): Promise<{
    StreamDescription: SimLambdaKinesisStreamDescription;
  }>;

  getShardIterator(
    command: {
      input: {
        StreamARN: string;
        ShardId: string;
        ShardIteratorType: string;
        StartingSequenceNumber?: string;
        Timestamp?: Date;
      };
    },
    options?: SimLambdaKinesisCallerOptions,
  ): Promise<{ ShardIterator: string }>;

  getRecords(
    command: { input: { ShardIterator: string; Limit: number } },
    options?: SimLambdaKinesisCallerOptions,
  ): Promise<{
    Records: readonly SimLambdaKinesisStreamRecord[];
    NextShardIterator: string;
  }>;
}

/**
 * The part of simulated Kinesis that says when a record has been put.
 */
export interface SimLambdaKinesisStreamActivity {
  watch(streamArn: string, watcher: SimLambdaEventSourceStreamWatcher): void;
  unwatch(streamArn: string, watcher: SimLambdaEventSourceStreamWatcher): void;
}

/**
 * The narrow slice of simulated Kinesis that event source polling needs.
 * SimKinesis structurally implements this interface.
 */
export interface SimLambdaKinesisStreamService extends SimLambdaKinesisStreamCommands {
  streamActivity(): SimLambdaKinesisStreamActivity;
}
