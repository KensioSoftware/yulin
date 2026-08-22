import { SimFirehoseInvalidArgumentException } from "../../error/sim-firehose.error.js";
import type { SimFirehoseRecordInput } from "./record.command.js";

/**
 * The largest record real Firehose takes, before base64 encoding.
 */
const maxRecordBytes = 1000 * 1024;

/**
 * The most records one PutRecordBatch request may carry.
 */
export const maxBatchRecords = 500;

/**
 * The largest PutRecordBatch request real Firehose takes.
 */
const maxBatchBytes = 4 * 1024 * 1024;

/**
 * Read the bytes one record carries, or refuse it.
 *
 * The `position` names where the record was, so a refusal on a batch says which
 * record it was about.
 */
export function simFirehoseRecordData(
  record: SimFirehoseRecordInput | undefined,
  position?: number,
): Uint8Array {
  const where = position === undefined ? "" : ` at index ${String(position)}`;

  if (record?.Data === undefined) {
    throw new SimFirehoseInvalidArgumentException(
      `The record${where} carries no Data`,
    );
  }

  if (record.Data.byteLength > maxRecordBytes) {
    throw new SimFirehoseInvalidArgumentException(
      `The record${where} is ${String(record.Data.byteLength)} bytes, over ` +
        `the ${String(maxRecordBytes)} bytes Firehose takes`,
    );
  }

  return record.Data;
}

/**
 * Read the bytes a batch of records carries, or refuse the batch.
 *
 * Real Firehose measures the whole request against its own limit as well as
 * each record against theirs, and refuses the request rather than dropping the
 * records that would not fit.
 */
export function simFirehoseBatchData(
  records: readonly SimFirehoseRecordInput[] | undefined,
): readonly Uint8Array[] {
  if (records === undefined || records.length === 0) {
    throw new SimFirehoseInvalidArgumentException(
      "A PutRecordBatch request has to carry at least one record",
    );
  }

  if (records.length > maxBatchRecords) {
    throw new SimFirehoseInvalidArgumentException(
      `A PutRecordBatch request carries ${String(records.length)} records, ` +
        `over the ${String(maxBatchRecords)} Firehose takes`,
    );
  }

  const data = records.map((record, position) =>
    simFirehoseRecordData(record, position),
  );
  const bytes = data.reduce((total, record) => total + record.byteLength, 0);

  if (bytes > maxBatchBytes) {
    throw new SimFirehoseInvalidArgumentException(
      `A PutRecordBatch request carries ${String(bytes)} bytes, over the ` +
        `${String(maxBatchBytes)} Firehose takes`,
    );
  }

  return data;
}
