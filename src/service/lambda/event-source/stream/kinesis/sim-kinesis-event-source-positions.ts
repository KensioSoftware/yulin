import type { SimLambdaEventSourceStreamPosition } from "../sim-lambda-event-source-streams.js";

/**
 * A place named as something other than an iterator, which is what an iterator
 * has to be asked for.
 */
export type SimLambdaKinesisNamedPosition = Exclude<
  SimLambdaEventSourceStreamPosition,
  { readonly kind: "iterator" }
>;

/**
 * What GetShardIterator is asked for a named place with.
 */
export interface SimKinesisEventSourceIteratorType {
  readonly ShardIteratorType: string;
  readonly StartingSequenceNumber?: string;
  readonly Timestamp?: Date;
}

/**
 * The GetShardIterator input fields a named place asks for.
 *
 * A sequence number is asked for with `AT_SEQUENCE_NUMBER` rather than
 * `AFTER_SEQUENCE_NUMBER`: the record named is one the function is to be given
 * again, not one it is finished with.
 */
export function simKinesisEventSourceIteratorTypeOf(
  position: SimLambdaKinesisNamedPosition,
): SimKinesisEventSourceIteratorType {
  if (position.kind === "sequence") {
    return {
      ShardIteratorType: "AT_SEQUENCE_NUMBER",
      StartingSequenceNumber: position.sequenceNumber,
    };
  }

  const { start } = position;

  return {
    ShardIteratorType: start.position,
    ...(start.timestamp !== undefined && { Timestamp: start.timestamp }),
  };
}
