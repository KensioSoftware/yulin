import {
  assertIdentical,
  assertInstanceOf,
  assertThrowsError,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import { readSimDynamoDbProjection } from "./sim-dynamodb-projection-expression.js";

/**
 * Read a projection, returning whatever it is refused with.
 */
function refusal(
  expression: string,
  names?: Readonly<Record<string, string>>,
): Error {
  return assertThrowsError(() =>
    readSimDynamoDbProjection({
      ProjectionExpression: expression,
      ExpressionAttributeNames: names,
    }),
  );
}

describe("readSimDynamoDbProjection", () => {
  it("reads nothing for a request with no expression", () => {
    // Given a request asking for the whole item.
    // When the projection is read, then there is none, so nothing cuts the
    // item down.
    assertUndefined(readSimDynamoDbProjection({}));
  });

  it("refuses a placeholder the request never defined", () => {
    // Given an expression using a placeholder with no entry for it.
    // When the projection is read, then it is refused naming the placeholder.
    const error = refusal("#s, note");

    assertInstanceOf(error, SimDynamoDbValidationException);
    assertIdentical(
      error.message,
      "ExpressionAttributeNames does not define #s, which an expression uses",
    );
  });

  it("refuses a defined name the expression never uses", () => {
    // Given an expression edited to drop a path, with the placeholder it used
    // left behind.
    // When the projection is read, then the leftover is refused.
    const error = refusal("status", { "#c": "city" });

    assertInstanceOf(error, SimDynamoDbValidationException);
    assertIdentical(
      error.message,
      "Value provided in ExpressionAttributeNames is unused in expressions: #c",
    );
  });

  it("refuses an empty expression", () => {
    // Given an expression naming nothing, which asks for no attributes at all.
    // When the projection is read, then it is refused rather than read as
    // asking for everything.
    const error = refusal("  ");

    assertIdentical(
      error.message,
      "Invalid ProjectionExpression: the expression names no attributes, and " +
        "an expression cannot be empty",
    );
  });

  it("refuses two paths where one contains the other", () => {
    // Given a projection asking for a whole map and one attribute of it, which
    // does not say which of the two was wanted.
    // When the projection is read, then it is refused, as real DynamoDB
    // refuses overlapping paths.
    const error = refusal("address, address.city");

    assertIdentical(
      error.message,
      "Invalid ProjectionExpression: two document paths overlap with each " +
        "other, at 'address.city'",
    );
  });

  it("refuses two paths where the second contains the first", () => {
    // Given the same overlap written the other way round.
    // When the projection is read, then it is refused as well, rather than the
    // order of the paths deciding it.
    const error = refusal("address.city, address");

    assertIdentical(
      error.message,
      "Invalid ProjectionExpression: two document paths overlap with each " +
        "other, at 'address'",
    );
  });

  it("refuses one path named twice", () => {
    // Given a projection naming the same path twice, which real DynamoDB
    // counts as an overlap.
    // When the projection is read, then it is refused.
    const error = refusal("status, status");

    assertIdentical(
      error.message,
      "Invalid ProjectionExpression: two document paths overlap with each " +
        "other, at 'status'",
    );
  });

  it("refuses something left over after the last path", () => {
    // Given an expression with a stray bracket after its last path.
    // When the projection is read, then it is refused rather than read up to
    // the point it stopped making sense.
    const error = refusal("status]");

    assertIdentical(
      error.message,
      "Invalid ProjectionExpression: syntax error; ']' follows a document " +
        "path, where a comma or the end of the expression was expected",
    );
  });

  it("refuses a trailing comma", () => {
    // Given an expression ending in a comma, as one has after a path is
    // deleted from the end of it.
    // When the projection is read, then it is refused rather than read as the
    // paths before it.
    const error = refusal("status,");

    assertIdentical(
      error.message,
      "Invalid ProjectionExpression: syntax error; an attribute name " +
        "expected, but the expression ended",
    );
  });

  it("takes a name placeholder used by two paths", () => {
    // Given two paths reaching through the same placeholder, which uses the
    // one entry twice.
    // When the projection is read, then nothing is refused: an entry used
    // anywhere is used.
    readSimDynamoDbProjection({
      ProjectionExpression: "#a.city, #a.country",
      ExpressionAttributeNames: { "#a": "address" },
    });
  });
});
