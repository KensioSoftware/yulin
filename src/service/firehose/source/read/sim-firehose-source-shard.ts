import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type {
  SimFirehoseRecordSource,
  SimFirehoseSourceRecord,
} from "../sim-firehose-record-source.js";

interface SimFirehoseSourceShardProperties {
  readonly records: SimFirehoseRecordSource;
  readonly caller: SimAwsCaller;
  readonly iterator: string;
}

interface SimFirehoseSourceShardOpening {
  readonly records: SimFirehoseRecordSource;
  readonly streamArn: string;
  readonly shardId: string;
  readonly caller: SimAwsCaller;
}

/**
 * One shard of the stream a delivery stream reads, and the place it has
 * reached on it.
 *
 * The place is an iterator rather than a sequence number, which is what a read
 * hands back and what the next read carries.
 */
export class SimFirehoseSourceShard {
  private readonly records: SimFirehoseRecordSource;
  private readonly caller: SimAwsCaller;
  private iterator: string;

  private constructor(properties: SimFirehoseSourceShardProperties) {
    this.records = properties.records;
    this.caller = properties.caller;
    this.iterator = properties.iterator;
  }

  /**
   * Open a shard at the end of the stream, as the source Role.
   *
   * The iterator is taken now rather than at the first read. LATEST means
   * "after the newest record on the shard when the iterator was made", so
   * leaving it until something has been put would step over the record that
   * woke the delivery stream up.
   */
  static async atLatest(
    opening: SimFirehoseSourceShardOpening,
  ): Promise<SimFirehoseSourceShard> {
    const { records, streamArn, shardId, caller } = opening;
    const opened = await records.getShardIterator(
      {
        input: {
          StreamARN: streamArn,
          ShardId: shardId,
          ShardIteratorType: "LATEST",
        },
      },
      { caller },
    );

    return new this({ records, caller, iterator: opened.ShardIterator });
  }

  /**
   * Read up to a limit of records from where the last read left off.
   */
  async read(limit: number): Promise<readonly SimFirehoseSourceRecord[]> {
    const read = await this.records.getRecords(
      { input: { ShardIterator: this.iterator, Limit: limit } },
      { caller: this.caller },
    );

    this.iterator = read.NextShardIterator;

    return read.Records;
  }
}
