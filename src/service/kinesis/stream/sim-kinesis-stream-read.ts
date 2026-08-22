import type { SimKinesisRecord } from "./sim-kinesis-record.js";
import {
  simKinesisStreamAfter,
  type SimKinesisStreamPosition,
} from "./sim-kinesis-stream-position.js";
import { compareSimKinesisSequenceNumbers } from "./sim-kinesis-sequence-numbers.js";
import type { SimKinesisShard } from "./sim-kinesis-shard.js";

/**
 * What one read of a shard came back with.
 */
export interface SimKinesisShardRead {
  readonly records: readonly SimKinesisRecord[];
  readonly next: SimKinesisStreamPosition;
}

/**
 * Where in the records a position starts reading from.
 */
function startIndexOf(
  records: readonly SimKinesisRecord[],
  position: SimKinesisStreamPosition,
): number {
  if (position.kind === "start") {
    return 0;
  }

  if (position.kind === "timestamp") {
    const found = records.findIndex(
      (record) => record.arrivedAt.getTime() >= position.epochMillis,
    );

    return found === -1 ? records.length : found;
  }

  const wanted = position.kind === "at" ? 0 : 1;
  const found = records.findIndex(
    (record) =>
      compareSimKinesisSequenceNumbers(
        record.sequenceNumber,
        position.sequenceNumber,
      ) >= wanted,
  );

  return found === -1 ? records.length : found;
}

/**
 * Read up to a limit of records from a shard, starting at a position.
 *
 * An empty result is an ordinary answer rather than a problem. A reader that
 * has caught up gets nothing back and the position it already had, which is
 * what makes polling each successive iterator work.
 *
 * A position the retention window has outlived is not refused, unlike DynamoDB
 * Streams. Real Kinesis moves a reader on to the trim horizon and carries on,
 * and it reports how far behind the reader is instead.
 */
export function simKinesisShardRead(
  shard: SimKinesisShard,
  position: SimKinesisStreamPosition,
  limit: number,
): SimKinesisShardRead {
  const available = shard.records;
  const start = startIndexOf(available, position);
  const records = available.slice(start, start + limit);
  const last = records.at(-1);

  return {
    records,
    next:
      last === undefined
        ? position
        : simKinesisStreamAfter(last.sequenceNumber),
  };
}
