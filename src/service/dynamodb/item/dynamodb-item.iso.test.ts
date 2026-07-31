import { assertIdentical, assertUndefined } from "@kensio/smartass";
import { describe, it } from "vitest";
import { DynamoDbItem } from "./dynamodb-item.js";

describe("DynamoDbItem", () => {
  it("reads an attribute it was written with", () => {
    // Given an item with one attribute.
    const item = DynamoDbItem.fromAttributeValues({ id: { S: "abc" } });

    // Then the attribute is there to read.
    assertIdentical(item.attribute("id")?.value, "abc");
  });

  it("has no attribute it was not written with", () => {
    // Given an item with one attribute.
    const item = DynamoDbItem.fromAttributeValues({ id: { S: "abc" } });

    // Then a name it does not carry reads as missing, including one every
    // object inherits from its prototype.
    assertUndefined(item.attribute("missing"));
    assertUndefined(item.attribute("constructor"));
    assertUndefined(item.attribute("toString"));
  });

  it("reads an attribute named after a prototype member", () => {
    // Given an item whose attribute name is one every object inherits.
    const item = DynamoDbItem.fromAttributeValues({
      constructor: { S: "a real attribute" },
    });

    // Then the item's own attribute is the one that answers.
    assertIdentical(item.attribute("constructor")?.value, "a real attribute");
  });
});
