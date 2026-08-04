import { SimDynamoDbTrimmedDataAccessException } from "../error/dynamodb.error.js";
import type { SimDynamoDbStreamRecord } from "./sim-dynamodb-stream-record.js";
import {
  simDynamoDbStreamAfter,
  type SimDynamoDbStreamPosition,
} from "./sim-dynamodb-stream-position.js";
import { compareSimDynamoDbSequenceNumbers } from "./sim-dynamodb-stream-sequence-numbers.js";
import type { SimDynamoDbStreamShard } from "./sim-dynamodb-stream-shard.js";

/**
 * What one read of a shard came back with.
 *
 * `drained` is only true of a closed shard a reader has reached the end of. An
 * open shard is never drained, however empty it is: more may yet be written to
 * it, and that is the difference between a reader that should look again and
 * one that is finished.
 */
export interface SimDynamoDbStreamRead {
  readonly records: readonly SimDynamoDbStreamRecord[];
  readonly next: SimDynamoDbStreamPosition;
  readonly drained: boolean;
}

/**
 * Whether a shard has dropped the record a position names.
 *
 * `at` a trimmed sequence number is gone: that record is what was asked for.
 * `after` one is not, as long as the record following it survived, which is why
 * the two comparisons differ by the equal case.
 */
function isTrimmed(
  shard: SimDynamoDbStreamShard,
  sequenceNumber: string,
  inclusive: boolean,
): boolean {
  const trimmedThrough = shard.trimmedThrough;

  if (trimmedThrough === undefined) {
    return false;
  }

  const order = compareSimDynamoDbSequenceNumbers(
    sequenceNumber,
    trimmedThrough,
  );

  return inclusive ? order <= 0 : order < 0;
}

/**
 * Ensure a shard still holds the position a reader is asking for.
 *
 * Checked when an iterator is handed out as well as when one is used, because a
 * caller can name a sequence number the retention window has already outlived
 * and should find that out at the request rather than one call later.
 */
export function assertSimDynamoDbStreamPositionReadable(
  shard: SimDynamoDbStreamShard,
  position: SimDynamoDbStreamPosition,
): void {
  if (
    position.kind === "start" ||
    !isTrimmed(shard, position.sequenceNumber, position.kind === "at")
  ) {
    return;
  }

  throw new SimDynamoDbTrimmedDataAccessException(
    `Stream record with sequence number ${position.sequenceNumber} on shard ` +
      `${shard.shardId} is past the 24 hour trim point`,
  );
}

/**
 * Where in the records a position starts reading from.
 */
function startIndexOf(
  records: readonly SimDynamoDbStreamRecord[],
  position: SimDynamoDbStreamPosition,
): number {
  if (position.kind === "start") {
    return 0;
  }

  const wanted = position.kind === "at" ? 0 : 1;
  const found = records.findIndex(
    (record) =>
      compareSimDynamoDbSequenceNumbers(
        record.sequenceNumber,
        position.sequenceNumber,
      ) >= wanted,
  );

  return found === -1 ? records.length : found;
}

/**
 * Read up to a limit of records from a shard, starting at a position.
 *
 * An empty result is an ordinary answer rather than a problem: a reader that
 * has caught up with an open shard gets nothing back and the position it
 * already had, which is what makes polling each successive iterator work.
 */
export function simDynamoDbStreamRead(
  shard: SimDynamoDbStreamShard,
  position: SimDynamoDbStreamPosition,
  limit: number,
): SimDynamoDbStreamRead {
  assertSimDynamoDbStreamPositionReadable(shard, position);

  const available = shard.records;
  const start = startIndexOf(available, position);
  const records = available.slice(start, start + limit);
  const last = records.at(-1);

  return {
    records,
    next:
      last === undefined
        ? position
        : simDynamoDbStreamAfter(last.sequenceNumber),
    drained: !shard.isOpen && start + records.length >= available.length,
  };
}
