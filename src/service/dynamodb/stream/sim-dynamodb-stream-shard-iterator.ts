import { isRecord } from "../../../util/type-guard/record.js";
import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";
import type { SimDynamoDbStreamPosition } from "./sim-dynamodb-stream-position.js";

/**
 * What a shard iterator stands for: one place on one shard of one stream.
 */
export interface SimDynamoDbShardIterator {
  readonly streamArn: string;
  readonly shardId: string;
  readonly position: SimDynamoDbStreamPosition;
}

/**
 * The three position kinds, as a value read back out of a token has to be one
 * of them before it is trusted.
 */
const positionKinds = new Set(["start", "at", "after"]);

/**
 * Refuse a shard iterator a request carries that this simulation never made.
 */
function refuse(): never {
  throw new SimDynamoDbValidationException(
    "The provided ShardIterator is not valid",
  );
}

/**
 * Read a position back out of a decoded token.
 */
function readPosition(value: unknown): SimDynamoDbStreamPosition {
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
 * one is the same shape: the place it stands for travels inside it rather than
 * in a table of handed-out iterators. That is what lets an iterator be used
 * against the stream it names without the stream having to remember it, which
 * is also why the 15 minute expiry is deliberately absent here rather than
 * approximated.
 */
export function simDynamoDbShardIteratorToken(
  iterator: SimDynamoDbShardIterator,
): string {
  return Buffer.from(JSON.stringify(iterator), "utf8").toString("base64url");
}

/**
 * Read the place a shard iterator a request carries stands for.
 */
export function readSimDynamoDbShardIteratorToken(
  token: string | undefined,
): SimDynamoDbShardIterator {
  if (token === undefined || token === "") {
    throw new SimDynamoDbValidationException(
      "GetRecords requires a ShardIterator",
    );
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
