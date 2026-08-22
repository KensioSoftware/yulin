import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import { SimFirehoseError } from "../error/sim-firehose.error.js";

/**
 * What a Firehose read of a stream carries besides its command input.
 *
 * Every read is made as the source `RoleARN`, so simulated IAM decides it the
 * way real IAM decides a real Firehose read.
 */
export interface SimFirehoseSourceCallerOptions {
  readonly caller: SimAwsCaller;
}

/**
 * One shard of a stream, as DescribeStream reports it.
 */
export interface SimFirehoseSourceShardDescription {
  readonly ShardId?: string | undefined;
}

/**
 * A stream, as DescribeStream reports it.
 */
export interface SimFirehoseSourceStreamDescription {
  readonly Shards?: readonly SimFirehoseSourceShardDescription[] | undefined;
  readonly HasMoreShards?: boolean | undefined;
}

/**
 * One record as a stream hands it to a delivery stream.
 *
 * The bytes are the whole of it. A Kinesis-sourced delivery stream writes the
 * record's data into the Object and nothing else about the record, which is
 * why the sequence number and the partition key are absent here.
 */
export interface SimFirehoseSourceRecord {
  readonly Data: Uint8Array;
}

/**
 * Something outside Firehose waiting for records on a stream.
 */
export interface SimFirehoseSourceWatcher {
  /**
   * A record has been put, and can be read now.
   */
  recordsAvailable(): void;
}

/**
 * The part of simulated Kinesis that says when a record has been put.
 */
export interface SimFirehoseSourceActivity {
  watch(streamArn: string, watcher: SimFirehoseSourceWatcher): void;
  unwatch(streamArn: string, watcher: SimFirehoseSourceWatcher): void;
}

/**
 * The narrow slice of simulated Kinesis a delivery stream reads through.
 *
 * These are the SDK operations a real Firehose performs, in the order it
 * performs them: find the shards, ask for a place at the end of one, then read
 * from there. Going through the commands rather than through a reader of
 * Yulin's own is what makes each call authorize as the source Role.
 *
 * `SimKinesis` structurally implements this interface.
 */
export interface SimFirehoseRecordSource {
  describeStream(
    command: {
      input: {
        StreamARN: string;
        Limit?: number;
        ExclusiveStartShardId?: string;
      };
    },
    options?: SimFirehoseSourceCallerOptions,
  ): Promise<{ StreamDescription: SimFirehoseSourceStreamDescription }>;

  getShardIterator(
    command: {
      input: { StreamARN: string; ShardId: string; ShardIteratorType: string };
    },
    options?: SimFirehoseSourceCallerOptions,
  ): Promise<{ ShardIterator: string }>;

  getRecords(
    command: { input: { ShardIterator: string; Limit: number } },
    options?: SimFirehoseSourceCallerOptions,
  ): Promise<{
    Records: readonly SimFirehoseSourceRecord[];
    NextShardIterator: string;
  }>;

  streamActivity(): SimFirehoseSourceActivity;
}

/**
 * The record source used when no simulated Kinesis is wired up, such as for a
 * standalone SimFirehose constructed outside SimAws.
 *
 * Every read refuses, so a delivery stream created against a Kinesis stream
 * says why it takes nothing rather than quietly taking nothing.
 */
export class SimFirehoseNoRecordSource
  implements SimFirehoseRecordSource, SimFirehoseSourceActivity
{
  /**
   * Refuse to look at a stream, explaining how to reach one.
   */
  describeStream(command: {
    input: { StreamARN: string };
  }): Promise<{ StreamDescription: SimFirehoseSourceStreamDescription }> {
    return Promise.reject(this.noStreams(command.input.StreamARN));
  }

  /**
   * Refuse to take a place on a shard, explaining how to reach a stream.
   */
  getShardIterator(command: {
    input: { StreamARN: string };
  }): Promise<{ ShardIterator: string }> {
    return Promise.reject(this.noStreams(command.input.StreamARN));
  }

  /**
   * Refuse to read: there was never a place to read from.
   */
  getRecords(): Promise<{
    Records: readonly SimFirehoseSourceRecord[];
    NextShardIterator: string;
  }> {
    return Promise.reject(this.noStreams("a stream"));
  }

  /**
   * Answer with the activity of a simulation holding no streams, which is
   * this: nothing here ever has records to read.
   */
  streamActivity(): SimFirehoseSourceActivity {
    return this;
  }

  /**
   * Watch nothing: there is no stream to watch.
   */
  watch(): void {
    //
  }

  /**
   * Stop watching nothing.
   */
  unwatch(): void {
    //
  }

  private noStreams(streamArn: string): SimFirehoseError {
    return new SimFirehoseError(
      `Cannot read ${streamArn}: this SimFirehose has no simulated Kinesis ` +
        "to read. Create the delivery stream through SimAws, or construct " +
        "SimFirehose with a kinesis to read from.",
    );
  }
}
