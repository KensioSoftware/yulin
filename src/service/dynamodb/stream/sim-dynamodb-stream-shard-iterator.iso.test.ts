import {
  assertInstanceOf,
  assertObjectEquals,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";
import {
  readSimDynamoDbShardIteratorToken,
  type SimDynamoDbShardIterator,
  simDynamoDbShardIteratorToken,
} from "./sim-dynamodb-stream-shard-iterator.js";

/**
 * The place a token in these tests stands for.
 */
const iterator: SimDynamoDbShardIterator = {
  streamArn: "arn:aws:dynamodb:eu-west-2:666666666666:table/orders/stream/x",
  shardId: "shardId-00000000000000000000-2bac9cd2",
  position: { kind: "after", sequenceNumber: "100000000000000000000" },
};

/**
 * A token carrying whatever a caller has made of it.
 */
function tokenOf(contents: unknown): string {
  return Buffer.from(JSON.stringify(contents), "utf8").toString("base64url");
}

/**
 * A token whose position is whatever a caller has made of it.
 */
function positionToken(position: unknown): string {
  return tokenOf({ streamArn: "arn", shardId: "shard", position });
}

/**
 * Read a token, which every test here expects to be refused.
 */
function refuse(token: string | undefined): void {
  const error = assertThrowsError(() =>
    readSimDynamoDbShardIteratorToken(token),
  );

  assertInstanceOf(error, SimDynamoDbValidationException);
}

describe("DynamoDB stream shard iterator tokens", () => {
  it("reads back the place it was made from", () => {
    // Given a token for a place on a shard.
    const token = simDynamoDbShardIteratorToken(iterator);

    // When it is read back.
    const read = readSimDynamoDbShardIteratorToken(token);

    // Then it stands for the place it was made from.
    assertObjectEquals({ ...read }, { ...iterator });
  });

  it("carries each of the three positions", () => {
    // Given a token for each position a reader can be at.
    for (const position of [
      { kind: "start" },
      { kind: "at", sequenceNumber: "100000000000000000001" },
      { kind: "after", sequenceNumber: "100000000000000000002" },
    ] as const) {
      // When it is read back.
      const read = readSimDynamoDbShardIteratorToken(
        simDynamoDbShardIteratorToken({ ...iterator, position }),
      );

      // Then the position is the one it was made with.
      assertObjectEquals(read.position, position);
    }
  });

  it("refuses a token with nothing readable in it", () => {
    // Given tokens with no readable contents at all.
    // When each is read.
    // Then every one is refused rather than read as a position.
    refuse(undefined);
    refuse("");
    refuse("not-base64url-json");
    refuse(tokenOf(["not", "an", "object"]));
    refuse(tokenOf({ shardId: "shard", position: { kind: "start" } }));
  });

  it("refuses a token whose position is not one it makes", () => {
    // Given tokens carrying a position this never wrote.
    // When each is read.
    // Then every one is refused.
    refuse(positionToken("start"));
    refuse(positionToken({ kind: "middle" }));
    refuse(positionToken({ kind: "at" }));
  });
});
