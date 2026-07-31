import {
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import type { SimDynamoDbAttributeValue } from "../command/item/item.types.js";
import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";
import { SimDynamoDbItem } from "./sim-dynamodb-item.js";

/**
 * Write an item's attributes and read them straight back.
 */
function roundTrip(
  attributes: Record<string, SimDynamoDbAttributeValue>,
): Record<string, SimDynamoDbAttributeValue> {
  return SimDynamoDbItem.fromAttributeValues(attributes).toAttributeValues();
}

describe("SimDynamoDbItem validation", () => {
  it("refuses an AttributeValue naming no datatype", () => {
    // When an attribute carries no descriptor at all.
    const error = assertThrowsError(() =>
      roundTrip({ nothing: {} as SimDynamoDbAttributeValue }),
    );

    // Then it is refused.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "must contain exactly one");
  });

  it("refuses nesting deeper than DynamoDB goes", () => {
    // Given an attribute nested one level further than DynamoDB allows.
    let nested: SimDynamoDbAttributeValue = { S: "too deep" };
    for (let level = 0; level < 32; level += 1) {
      nested = { L: [nested] };
    }

    // When the item carrying it is written.
    const error = assertThrowsError(() => roundTrip({ nested }));

    // Then it is refused.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "nested more than 32 levels");
  });

  it("takes nesting up to the depth DynamoDB allows", () => {
    // Given an attribute nested to exactly the allowed depth.
    let nested: SimDynamoDbAttributeValue = { S: "deep enough" };
    for (let level = 0; level < 31; level += 1) {
      nested = { L: [nested] };
    }

    // When the item carrying it is written.
    const attributes = roundTrip({ nested });

    // Then it is accepted.
    assertNonNullable(attributes["nested"]?.L);
  });

  it("refuses an item over 400 KB, counting its attribute names", () => {
    // Given an item whose values alone fit, and whose names take it over.
    const value = "a".repeat(100 * 1024);
    const attributes = {
      id: { S: "over-sized" },
      one: { S: value },
      two: { S: value },
      three: { S: value },
      four: { S: value },
    };

    // When the item is written.
    const error = assertThrowsError(() => roundTrip(attributes));

    // Then it is refused for its size.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "maximum allowed size");
  });
});
