import {
  assertIdentical,
  assertInstanceOf,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";
import { SimDynamoDbExpressionPlaceholders } from "./sim-dynamodb-expression-placeholders.js";

function names(
  entries?: Readonly<Record<string, string>>,
): SimDynamoDbExpressionPlaceholders<string> {
  return new SimDynamoDbExpressionPlaceholders({
    parameterName: "ExpressionAttributeNames",
    marker: "#",
    entries,
  });
}

describe("SimDynamoDbExpressionPlaceholders", () => {
  it("answers with what a placeholder stands for", () => {
    // Given names defining a placeholder for a reserved word.
    const placeholders = names({ "#s": "status" });

    // When an expression uses it, then it stands for the attribute name, and
    // nothing is left over.
    assertIdentical(placeholders.required("#s"), "status");
    placeholders.assertAllUsed();
  });

  it("counts a placeholder used more than once as used once", () => {
    // Given one placeholder used twice, as two paths into the same map would
    // use it.
    const placeholders = names({ "#s": "status" });

    placeholders.required("#s");
    placeholders.required("#s");

    // When the entries are checked, then nothing is unused.
    placeholders.assertAllUsed();
  });

  it("refuses a placeholder the request never defined", () => {
    // Given names defining nothing.
    const placeholders = names();

    // When an expression uses a placeholder, then it is refused naming the
    // placeholder, rather than read as an attribute called '#s'.
    const error = assertThrowsError(() => placeholders.required("#s"));

    assertInstanceOf(error, SimDynamoDbValidationException);
    assertIdentical(
      error.message,
      "ExpressionAttributeNames does not define #s, which an expression uses",
    );
  });

  it("refuses an entry no expression used", () => {
    // Given names defining two placeholders where an expression uses one, as a
    // request has after an expression is edited and the old placeholder is
    // left behind.
    const placeholders = names({ "#s": "status", "#c": "city" });

    placeholders.required("#s");

    // When the entries are checked, then the leftover is refused by name.
    const error = assertThrowsError(() => {
      placeholders.assertAllUsed();
    });

    assertInstanceOf(error, SimDynamoDbValidationException);
    assertIdentical(
      error.message,
      "Value provided in ExpressionAttributeNames is unused in expressions: #c",
    );
  });

  it("refuses a key that is not a placeholder", () => {
    // Given names keyed by the attribute name rather than by a placeholder,
    // which would leave every placeholder in the expression undefined.
    // When the placeholders are built, then the key is refused by name.
    const error = assertThrowsError(() => names({ status: "status" }));

    assertInstanceOf(error, SimDynamoDbValidationException);
    assertIdentical(
      error.message,
      "ExpressionAttributeNames contains the invalid key status. A " +
        "placeholder starts with '#'.",
    );
  });

  it("holds the values parameter the same way", () => {
    // Given the other placeholder parameter, which maps to attribute values
    // rather than to names.
    const values = new SimDynamoDbExpressionPlaceholders({
      parameterName: "ExpressionAttributeValues",
      marker: ":",
      entries: { ":wanted": { S: "shipped" } },
    });

    // When one is read, then it comes back, and the same rules apply: both
    // parameters work the same way, so they are held the same way.
    assertIdentical(values.required(":wanted").S, "shipped");
    assertIdentical(
      assertThrowsError(() => values.required(":other")).message,
      "ExpressionAttributeValues does not define :other, which an expression " +
        "uses",
    );
  });
});
