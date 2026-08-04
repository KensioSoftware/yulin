/**
 * Where on a shard a reader is, between one GetRecords and the next.
 *
 * The three kinds are what the four shard iterator types come down to.
 * TRIM_HORIZON is the start of whatever the shard still holds; LATEST is after
 * the newest record on it; AT_SEQUENCE_NUMBER and AFTER_SEQUENCE_NUMBER are the
 * two ways of naming a record, and the difference between them is whether that
 * record is handed back or stepped over.
 *
 * A position is a place rather than an index, so it survives the shard being
 * trimmed underneath it. That is what lets a read tell "you are asking for
 * records that have aged out" from "there is nothing new yet".
 */
export type SimDynamoDbStreamPosition =
  | { readonly kind: "start" }
  | { readonly kind: "at"; readonly sequenceNumber: string }
  | { readonly kind: "after"; readonly sequenceNumber: string };

/**
 * The position a reader starting from the oldest record it can reach is at.
 */
export const simDynamoDbStreamStart: SimDynamoDbStreamPosition = {
  kind: "start",
};

/**
 * The position a reader that has just taken a record is at.
 */
export function simDynamoDbStreamAfter(
  sequenceNumber: string,
): SimDynamoDbStreamPosition {
  return { kind: "after", sequenceNumber };
}
