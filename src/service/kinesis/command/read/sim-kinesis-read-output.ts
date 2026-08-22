import type { SimKinesisRecord } from "../../stream/sim-kinesis-record.js";
import type { SimKinesisRecordOutput } from "./read.command.js";

/**
 * How far behind the tip of the shard a read left the reader.
 *
 * Zero means caught up, which is what a reader that took everything the shard
 * holds is. Otherwise it is the age of the last record handed back, which is
 * how far the reader still has to travel in time to reach the newest one.
 */
export function simKinesisMillisBehindLatest(
  available: readonly SimKinesisRecord[],
  returned: readonly SimKinesisRecord[],
  now: Date,
): number {
  const last = returned.at(-1);

  if (last === undefined || last === available.at(-1)) {
    return 0;
  }

  return now.getTime() - last.arrivedAt.getTime();
}

/**
 * One record as GetRecords hands it back.
 */
export function simKinesisRecordOutput(
  record: SimKinesisRecord,
): SimKinesisRecordOutput {
  return {
    SequenceNumber: record.sequenceNumber,
    ApproximateArrivalTimestamp: record.arrivedAt,
    Data: record.data,
    PartitionKey: record.partitionKey,
  };
}
