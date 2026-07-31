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
 * Write an item's attributes and read them straight back.
 */
function roundTrip(
  attributes: Record<string, SimDynamoDbAttributeValue>,
): Record<string, SimDynamoDbAttributeValue> {
  return SimDynamoDbItem.fromAttributeValues(attributes).toAttributeValues();
}

describe("SimDynamoDbItem sets", () => {
  it("refuses an empty set", () => {
    // When an item carries a set with nothing in it.
    const error = assertThrowsError(() => roundTrip({ colours: { SS: [] } }));

    // Then it is refused, as real DynamoDB refuses it.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "set may not be empty");
  });

  it("refuses a set holding more than one kind of value", () => {
    // When a string set carries something that is not a string.
    const error = assertThrowsError(() =>
      roundTrip({
        colours: { SS: ["purple", 7] as unknown as readonly string[] },
      }),
    );

    // Then it is refused rather than stored as a mixed set.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "An SS set holds strings");
  });

  it("compares binary set members by their bytes", () => {
    // When a binary set carries two members holding the same bytes.
    const error = assertThrowsError(() =>
      roundTrip({
        tags: { BS: [new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3])] },
      }),
    );

    // Then they are the same member, rather than two objects that differ.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "contains duplicates");
  });

  it("refuses a number set holding the same number written twice", () => {
    // When a number set carries the same value in two forms.
    const error = assertThrowsError(() =>
      roundTrip({ readings: { NS: ["1", "1.0"] } }),
    );

    // Then they are the same member, since a number set compares by value.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "contains duplicates");
  });
});
