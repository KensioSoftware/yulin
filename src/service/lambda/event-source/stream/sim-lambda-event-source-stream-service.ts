import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type {
  SimLambdaEventSourceStreamRecord,
  SimLambdaEventSourceStreamWatcher,
} from "./sim-lambda-event-source-streams.js";

interface StreamCommandOptions {
  readonly caller: SimAwsCaller;
}

/**
 * One shard of a stream, as DescribeStream reports it.
 */
interface StreamShardDescription {
  readonly ShardId?: string | undefined;
}

/**
 * A stream, as DescribeStream reports it: what it carries changes for, and the
 * shard those changes are read from.
 */
export interface SimLambdaEventSourceStreamDescription {
  readonly TableName?: string | undefined;
  readonly Shards?: readonly StreamShardDescription[] | undefined;
}

/**
 * The narrow slice of simulated DynamoDB that event source polling needs.
 * SimDynamoDb structurally implements this interface.
 */
export interface SimLambdaEventSourceStreamService {
  streams(): SimLambdaEventSourceStreamCommands;
  streamActivity(): SimLambdaEventSourceStreamActivity;
}

/**
 * The DynamoDB Streams commands a poller reads a stream with.
 *
 * These are the SDK operations a real poller performs, in the order it performs
 * them: find the shard, ask for a place on it, then read from there. Going
 * through the commands rather than through a read interface of Yulin's own is
 * what makes each call authorize as the function's execution role.
 */
export interface SimLambdaEventSourceStreamCommands {
  describeStream(
    command: { input: { StreamArn: string } },
    options?: StreamCommandOptions,
  ): Promise<{
    StreamDescription?: SimLambdaEventSourceStreamDescription | undefined;
  }>;

  getShardIterator(
    command: {
      input: {
        StreamArn: string;
        ShardId: string;
        ShardIteratorType: string;
        SequenceNumber?: string | undefined;
      };
    },
    options?: StreamCommandOptions,
  ): Promise<{ ShardIterator?: string | undefined }>;

  getRecords(
    command: { input: { ShardIterator: string; Limit: number } },
    options?: StreamCommandOptions,
  ): Promise<{
    Records?: readonly SimLambdaEventSourceStreamRecord[] | undefined;
    NextShardIterator?: string | undefined;
  }>;
}

/**
 * The part of simulated DynamoDB that says when a record has been written to a
 * stream.
 */
export interface SimLambdaEventSourceStreamActivity {
  watch(streamArn: string, watcher: SimLambdaEventSourceStreamWatcher): void;
  unwatch(streamArn: string, watcher: SimLambdaEventSourceStreamWatcher): void;
}
