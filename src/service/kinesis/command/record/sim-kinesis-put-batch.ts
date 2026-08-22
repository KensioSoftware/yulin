import { SimKinesisInvalidArgumentException } from "../../error/sim-kinesis.error.js";
import type { SimKinesisPutRecordsRequestEntry } from "./record.command.js";
import {
  simKinesisMaxRecordBytes,
  simKinesisReadPutEntry,
  type SimKinesisReadPutEntry,
} from "./sim-kinesis-put-entry.js";

/**
 * The most records real Kinesis takes in one PutRecords request.
 */
const maxBatchRecords = 500;

/**
 * The most bytes real Kinesis takes across one PutRecords request.
 */
const maxBatchBytes = 5 * simKinesisMaxRecordBytes;

/**
 * Read the records a batch carried, refusing a batch Kinesis would refuse.
 *
 * The whole request is refused rather than the offending record, which is what
 * real Kinesis does with a malformed batch. Its per-record failures are for
 * records it could not take at that moment, not for records it will never take.
 */
export function simKinesisReadPutBatch(
  records: readonly SimKinesisPutRecordsRequestEntry[] | undefined,
): readonly SimKinesisReadPutEntry[] {
  if (records === undefined || records.length === 0) {
    throw new SimKinesisInvalidArgumentException(
      "PutRecords requires at least one record",
    );
  }

  if (records.length > maxBatchRecords) {
    throw new SimKinesisInvalidArgumentException(
      `PutRecords carries ${records.length} records, more than the ` +
        `${maxBatchRecords} Kinesis accepts in one request`,
    );
  }

  const read = records.map((record) => simKinesisReadPutEntry(record));

  // AWS counts the partition keys towards the request limit, unlike the
  // per-record one, which is on the data blob alone.
  const bytes = read.reduce(
    (total, entry) =>
      total +
      entry.data.byteLength +
      Buffer.byteLength(entry.partitionKey, "utf8"),
    0,
  );

  if (bytes > maxBatchBytes) {
    throw new SimKinesisInvalidArgumentException(
      `PutRecords carries ${bytes} bytes, more than the ${maxBatchBytes} ` +
        `bytes Kinesis accepts in one request`,
    );
  }

  return read;
}
