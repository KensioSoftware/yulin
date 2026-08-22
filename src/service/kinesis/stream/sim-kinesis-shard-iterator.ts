import { isRecord } from "../../../util/type-guard/record.js";
import { SimKinesisExpiredIteratorException } from "../error/sim-kinesis.error.js";
import type { SimKinesisStreamPosition } from "./sim-kinesis-stream-position.js";

/**
 * What a shard iterator stands for: one place on one shard of one stream.
 */
export interface SimKinesisShardIterator {
  readonly streamArn: string;
  readonly shardId: string;
  readonly position: SimKinesisStreamPosition;
}

/**
 * The four position kinds, as a value read back out of a token has to be one of
 * them before it is trusted.
 */
const positionKinds = new Set(["start", "at", "after", "timestamp"]);

/**
 * Refuse a shard iterator a request carries that this simulation never made.
 *
 * Real Kinesis reports an iterator it will not accept as expired, which is what
 * an unreadable one is here: something that was never valid, or is no longer.
 */
function refuse(): never {
  throw new SimKinesisExpiredIteratorException(
    "The provided ShardIterator is not valid",
  );
}

/**
 * Read a position back out of a decoded token.
 */
function readPosition(value: unknown): SimKinesisStreamPosition {
  if (!isRecord(value) || typeof value["kind"] !== "string") {
    refuse();
  }

  const kind = value["kind"];

  if (!positionKinds.has(kind)) {
    refuse();
  }

  if (kind === "start") {
    return { kind: "start" };
  }

  if (kind === "timestamp") {
    const epochMillis = value["epochMillis"];

    if (typeof epochMillis !== "number") {
      refuse();
    }

    return { kind: "timestamp", epochMillis };
  }

  const sequenceNumber = value["sequenceNumber"];

  if (typeof sequenceNumber !== "string") {
    refuse();
  }

  return kind === "at"
    ? { kind: "at", sequenceNumber }
    : { kind: "after", sequenceNumber };
}

/**
 * The opaque token a caller is handed to read on from a place.
 *
 * Real shard iterators are opaque strings a caller passes back unread, and this
 * one is the same shape. The place it stands for travels inside it rather than
 * in a table of handed-out iterators, which is what lets an iterator be used
 * against the stream it names without the stream having to remember it. That is
 * also why the five minute expiry is deliberately absent here rather than
 * approximated.
 */
export function simKinesisShardIteratorToken(
  iterator: SimKinesisShardIterator,
): string {
  return Buffer.from(JSON.stringify(iterator), "utf8").toString("base64url");
}

/**
 * Read the place a shard iterator a request carries stands for.
 */
export function readSimKinesisShardIteratorToken(
  token: string | undefined,
): SimKinesisShardIterator {
  if (token === undefined || token === "") {
    refuse();
  }

  let decoded: unknown;

  try {
    decoded = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
  } catch {
    refuse();
  }

  if (
    !isRecord(decoded) ||
    typeof decoded["streamArn"] !== "string" ||
    typeof decoded["shardId"] !== "string"
  ) {
    refuse();
  }

  return {
    streamArn: decoded["streamArn"],
    shardId: decoded["shardId"],
    position: readPosition(decoded["position"]),
  };
}
