/**
 * Where on a shard a reader is, between one GetRecords and the next.
 *
 * The four kinds are what the five shard iterator types come down to.
 * TRIM_HORIZON is the start of whatever the shard still holds.
 * AT_SEQUENCE_NUMBER and AFTER_SEQUENCE_NUMBER are the two ways of naming a
 * record, and the difference between them is whether that record is handed back
 * or stepped over. AT_TIMESTAMP names an instant instead.
 *
 * LATEST has no kind of its own. It means "after the newest record on the shard
 * when the iterator was made", which is either `after` that record or, on a
 * shard holding nothing, `start`. Resolving it where the iterator is made is
 * what pins it to that instant, as real Kinesis does.
 *
 * A position is a place rather than an index, so it survives the shard being
 * trimmed underneath it. That is what lets a read tell "you are asking for
 * records that have aged out" from "there is nothing new yet".
 */
export type SimKinesisStreamPosition =
  | { readonly kind: "start" }
  | { readonly kind: "at"; readonly sequenceNumber: string }
  | { readonly kind: "after"; readonly sequenceNumber: string }
  | { readonly kind: "timestamp"; readonly epochMillis: number };

/**
 * The position a reader starting from the oldest record it can reach is at.
 */
export const simKinesisStreamStart: SimKinesisStreamPosition = {
  kind: "start",
};

/**
 * The position a reader that has just taken a record is at.
 */
export function simKinesisStreamAfter(
  sequenceNumber: string,
): SimKinesisStreamPosition {
  return { kind: "after", sequenceNumber };
}
