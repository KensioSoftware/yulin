import { SimKinesisInvalidArgumentException } from "../../error/sim-kinesis.error.js";
import type { SimKinesisShard } from "../../stream/sim-kinesis-shard.js";
import {
  simKinesisStreamAfter,
  simKinesisStreamStart,
  type SimKinesisStreamPosition,
} from "../../stream/sim-kinesis-stream-position.js";
import type { SimGetShardIteratorCommandInput } from "./read.command.js";

/**
 * The shard iterator types real Kinesis hands out an iterator for.
 */
const iteratorTypes = new Set([
  "AT_SEQUENCE_NUMBER",
  "AFTER_SEQUENCE_NUMBER",
  "AT_TIMESTAMP",
  "TRIM_HORIZON",
  "LATEST",
]);

/**
 * The sequence number a request naming one has to carry.
 */
function requiredSequenceNumber(
  input: SimGetShardIteratorCommandInput,
): string {
  const { StartingSequenceNumber, ShardIteratorType } = input;

  if (StartingSequenceNumber === undefined || StartingSequenceNumber === "") {
    throw new SimKinesisInvalidArgumentException(
      `A ${ShardIteratorType} shard iterator requires a ` +
        `StartingSequenceNumber`,
    );
  }

  return StartingSequenceNumber;
}

/**
 * The instant a request naming one has to carry.
 */
function requiredTimestamp(input: SimGetShardIteratorCommandInput): Date {
  const { Timestamp } = input;

  if (Timestamp === undefined) {
    throw new SimKinesisInvalidArgumentException(
      "An AT_TIMESTAMP shard iterator requires a Timestamp",
    );
  }

  return Timestamp;
}

/**
 * The place on a shard a requested iterator type stands for.
 *
 * LATEST is resolved here rather than carried into the iterator, which is what
 * pins it to the instant the iterator was made. A shard holding nothing yet has
 * no record to sit after, and starting from the beginning of an empty shard is
 * the same place.
 */
export function simKinesisIteratorPosition(
  input: SimGetShardIteratorCommandInput,
  shard: SimKinesisShard,
): SimKinesisStreamPosition {
  const type = input.ShardIteratorType;

  if (type === undefined || !iteratorTypes.has(type)) {
    throw new SimKinesisInvalidArgumentException(
      `ShardIteratorType '${type}' is not one of ${[...iteratorTypes].join(
        ", ",
      )}`,
    );
  }

  switch (type) {
    case "TRIM_HORIZON": {
      return simKinesisStreamStart;
    }

    case "AT_SEQUENCE_NUMBER": {
      return { kind: "at", sequenceNumber: requiredSequenceNumber(input) };
    }

    case "AFTER_SEQUENCE_NUMBER": {
      return simKinesisStreamAfter(requiredSequenceNumber(input));
    }

    case "AT_TIMESTAMP": {
      return {
        kind: "timestamp",
        epochMillis: requiredTimestamp(input).getTime(),
      };
    }

    default: {
      const latest = shard.latestSequenceNumber;

      return latest === undefined
        ? simKinesisStreamStart
        : simKinesisStreamAfter(latest);
    }
  }
}
