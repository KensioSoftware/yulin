import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import type { SimDynamoDbAttributeValue } from "../command/item/item.types.js";
import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";
import { SimDynamoDbItem } from "./sim-dynamodb-item.js";

/**
 * Read an attribute carrying something its descriptor does not describe.
 *
 * The SDK's own types make these unreachable, but a caller working from JSON,
 * a CloudFormation template or plain JavaScript can send anything, so each is
 * checked rather than assumed.
 */
function refusedValue(value: unknown): Error {
  return assertThrowsError(() =>
    SimDynamoDbItem.fromAttributeValues({
      attribute: value as SimDynamoDbAttributeValue,
    }),
  );
}

describe("SimDynamoDbItem malformed attribute values", () => {
  it.each([
    { given: { S: 123 }, reported: "The AttributeValue S must be a string" },
    { given: { N: 42 }, reported: "The AttributeValue N must be a string" },
    { given: { B: "bytes" }, reported: "The AttributeValue B must be binary" },
    {
      given: { SS: "purple" },
      reported: "The AttributeValue SS must be a list of set members",
    },
    { given: { NS: [7] }, reported: "An NS set holds numbers" },
    { given: { BS: ["bytes"] }, reported: "A BS set holds binary values" },
    {
      given: { $unknown: ["Foo", 1] },
      reported: "unsupported datatype: $unknown",
    },
  ])("refuses $given", ({ given, reported }) => {
    // When an attribute carries something its descriptor does not describe.
    const error = refusedValue(given);

    // Then it is refused, naming what was wrong with it.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, reported);
  });
});
