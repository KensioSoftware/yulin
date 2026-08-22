import type { SimLambdaEventSourceStreamPosition } from "./sim-lambda-event-source-streams.js";

/**
 * A place named as something other than an iterator, which is what an iterator
 * has to be asked for.
 */
export type SimLambdaEventSourceStreamNamedPosition = Exclude<
  SimLambdaEventSourceStreamPosition,
  { readonly kind: "iterator" }
>;

/**
 * What GetShardIterator is asked for a named place with.
 */
export interface SimDynamoDbEventSourceIteratorType {
  readonly ShardIteratorType: string;
  readonly SequenceNumber?: string;
  readonly Timestamp?: Date;
}

/**
 * The GetShardIterator input fields a named place asks for.
 *
 * A sequence number is asked for with `AT_SEQUENCE_NUMBER` rather than
 * `AFTER_SEQUENCE_NUMBER`: the record named is one the function is to be given
 * again, not one it is finished with.
 */
export function simDynamoDbEventSourceIteratorTypeOf(
  position: SimLambdaEventSourceStreamNamedPosition,
): SimDynamoDbEventSourceIteratorType {
  if (position.kind === "starting") {
    const { start } = position;

    return {
      ShardIteratorType: start.position,
      ...(start.timestamp !== undefined && { Timestamp: start.timestamp }),
    };
  }

  return {
    ShardIteratorType: "AT_SEQUENCE_NUMBER",
    SequenceNumber: position.sequenceNumber,
  };
}

/**
 * Where a read leaves the reader.
 *
 * A shard with no next iterator is finished with, so there is nowhere to carry
 * on from and the place the read started at stands.
 */
export function simDynamoDbEventSourceNextPosition(
  shardIterator: string | undefined,
  readFrom: SimLambdaEventSourceStreamPosition,
): SimLambdaEventSourceStreamPosition {
  if (shardIterator === undefined) {
    return readFrom;
  }

  return { kind: "iterator", shardIterator };
}
