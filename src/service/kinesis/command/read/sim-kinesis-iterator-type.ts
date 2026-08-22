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
const iteratorTypes = [
  "AT_SEQUENCE_NUMBER",
  "AFTER_SEQUENCE_NUMBER",
  "AT_TIMESTAMP",
  "TRIM_HORIZON",
  "LATEST",
] as const;

type SimKinesisIteratorType = (typeof iteratorTypes)[number];

/**
 * Read the iterator type a request asked for.
 *
 * Narrowing to the five here is what lets the switch below cover them all
 * without a fallback branch standing in for whichever was left out.
 */
function readIteratorType(type: string | undefined): SimKinesisIteratorType {
  const found = iteratorTypes.find((candidate) => candidate === type);

  if (found === undefined) {
    throw new SimKinesisInvalidArgumentException(
      `ShardIteratorType '${type}' is not one of ${iteratorTypes.join(", ")}`,
    );
  }

  return found;
}

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
 *
 * A date that is not a date is refused here rather than carried on as a
 * position of `NaN` milliseconds, which nothing would ever compare true against
 * and which would leave the read quietly finding nothing.
 */
function requiredTimestamp(input: SimGetShardIteratorCommandInput): Date {
  const { Timestamp } = input;

  if (Timestamp === undefined || Number.isNaN(Timestamp.getTime())) {
    throw new SimKinesisInvalidArgumentException(
      "An AT_TIMESTAMP shard iterator requires a Timestamp that is a date",
    );
  }

  return Timestamp;
}

/**
 * Where a LATEST iterator stands.
 *
 * It means "after the newest record on the shard when the iterator was made".
 * A shard holding nothing yet has no record to sit after, and starting from the
 * beginning of an empty shard is the same place.
 */
function latestPosition(shard: SimKinesisShard): SimKinesisStreamPosition {
  const latest = shard.latestSequenceNumber;

  return latest === undefined
    ? simKinesisStreamStart
    : simKinesisStreamAfter(latest);
}

/**
 * The place on a shard a requested iterator type stands for.
 *
 * LATEST is resolved here rather than carried into the iterator, which is what
 * pins it to the instant the iterator was made.
 */
export function simKinesisIteratorPosition(
  input: SimGetShardIteratorCommandInput,
  shard: SimKinesisShard,
): SimKinesisStreamPosition {
  switch (readIteratorType(input.ShardIteratorType)) {
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

    case "LATEST": {
      return latestPosition(shard);
    }
  }
}
