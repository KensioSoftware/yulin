import { assertInstanceOf, assertThrowsError } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimKinesisExpiredIteratorException } from "../error/sim-kinesis.error.js";
import { readSimKinesisShardIteratorToken } from "./sim-kinesis-shard-iterator.js";

const streamArn = "arn:aws:kinesis:eu-west-2:111111111111:stream/orders";

const shardId = "shardId-000000000000";

/**
 * Read a token and require it to be refused.
 *
 * Real Kinesis reports an iterator it will not accept as expired, which is what
 * an unreadable one is here.
 */
function assertRefused(token: string | undefined): void {
  const error = assertThrowsError(() => {
    readSimKinesisShardIteratorToken(token);
  });
  assertInstanceOf(error, SimKinesisExpiredIteratorException);
}

/**
 * A token carrying whatever it is given, however unlike an iterator it is.
 */
function tokenOf(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

describe("A shard iterator simulated Kinesis will not read", () => {
  it("refuses a token that is missing or malformed", () => {
    // When records are read with no token, and with one that is not a token.
    // Then each is refused.
    assertRefused(undefined);
    assertRefused("");
    assertRefused("not-an-iterator");
  });

  it("refuses a token carrying no stream or no shard", () => {
    // When records are read with tokens that decode to the wrong shape.
    // Then each is refused.
    assertRefused(tokenOf({ shardId }));
    assertRefused(tokenOf({ streamArn }));
    assertRefused(tokenOf("a string"));
  });

  it("refuses a token carrying a position it cannot stand at", () => {
    // Given positions of a kind Kinesis does not have, and positions missing
    // the value their kind needs.
    const positions = [
      { kind: "somewhere" },
      { kind: "at" },
      { kind: "after" },
      { kind: "timestamp" },
      "not a position",
    ];

    // When records are read with a token carrying each.
    // Then each is refused.
    for (const position of positions) {
      assertRefused(tokenOf({ streamArn, shardId, position }));
    }
  });
});
