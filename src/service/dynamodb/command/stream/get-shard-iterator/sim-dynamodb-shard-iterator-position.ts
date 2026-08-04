import { SimDynamoDbValidationException } from "../../../error/dynamodb.error.js";
import {
  simDynamoDbStreamAfter,
  type SimDynamoDbStreamPosition,
  simDynamoDbStreamStart,
} from "../../../stream/sim-dynamodb-stream-position.js";
import { readSimDynamoDbSequenceNumber } from "../../../stream/sim-dynamodb-stream-sequence-numbers.js";
import type { SimDynamoDbStreamShard } from "../../../stream/sim-dynamodb-stream-shard.js";
import type { SimGetShardIteratorCommandInput } from "./get-shard-iterator.command.js";

/**
 * The iterator types that name a record, and so carry a sequence number.
 */
const sequenceNumberTypes = new Set([
  "AT_SEQUENCE_NUMBER",
  "AFTER_SEQUENCE_NUMBER",
]);

/**
 * Refuse a sequence number given with an iterator type that has no place for
 * one.
 *
 * TRIM_HORIZON and LATEST are both ends of the shard rather than a record on
 * it, so a request that gives one of them a sequence number is saying two
 * different things about where to start. Taking the type and dropping the
 * number would silently read from somewhere the caller did not ask for.
 */
function assertNoSequenceNumber(
  input: SimGetShardIteratorCommandInput,
  iteratorType: string,
): void {
  if (input.SequenceNumber !== undefined) {
    throw new SimDynamoDbValidationException(
      `GetShardIterator takes no SequenceNumber with the ShardIteratorType ${
        iteratorType
      }`,
    );
  }
}

/**
 * Where on a shard the iterator type a request asks for starts reading.
 *
 * LATEST on an empty shard is the start of it, which is the same place: an
 * empty shard has nothing before its end either.
 */
export function simDynamoDbShardIteratorPosition(
  input: SimGetShardIteratorCommandInput,
  shard: SimDynamoDbStreamShard,
): SimDynamoDbStreamPosition {
  const iteratorType = input.ShardIteratorType;

  if (iteratorType === "TRIM_HORIZON") {
    assertNoSequenceNumber(input, iteratorType);

    return simDynamoDbStreamStart;
  }

  if (iteratorType === "LATEST") {
    assertNoSequenceNumber(input, iteratorType);
    const newest = shard.records.at(-1);

    return newest === undefined
      ? simDynamoDbStreamStart
      : simDynamoDbStreamAfter(newest.sequenceNumber);
  }

  if (iteratorType === undefined || !sequenceNumberTypes.has(iteratorType)) {
    throw new SimDynamoDbValidationException(
      `GetShardIterator needs a ShardIteratorType of TRIM_HORIZON, LATEST, ` +
        `AT_SEQUENCE_NUMBER or AFTER_SEQUENCE_NUMBER`,
    );
  }

  const sequenceNumber = readSimDynamoDbSequenceNumber(
    input.SequenceNumber,
    `GetShardIterator with the ShardIteratorType ${iteratorType}`,
  );

  return iteratorType === "AT_SEQUENCE_NUMBER"
    ? { kind: "at", sequenceNumber }
    : simDynamoDbStreamAfter(sequenceNumber);
}
