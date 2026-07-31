import {
  assertArrayEquals,
  assertFalse,
  assertIdentical,
  assertObjectEquals,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import type { SimDynamoDbAttributeValue } from "../command/item/item.types.js";
import { SimDynamoDbItem } from "./sim-dynamodb-item.js";

/**
 * Write an item's attributes and read them straight back.
 */
function roundTrip(
  attributes: Record<string, SimDynamoDbAttributeValue>,
): Record<string, SimDynamoDbAttributeValue> {
  return SimDynamoDbItem.fromAttributeValues(attributes).toAttributeValues();
}

describe("SimDynamoDbItem attribute values", () => {
  it("round trips every scalar descriptor unchanged", () => {
    // When an item carrying each scalar kind is written and read back.
    const attributes = roundTrip({
      name: { S: "Foo McBar" },
      empty: { S: "" },
      counter: { N: "9007199254740993" },
      picture: { B: new Uint8Array([137, 80, 78, 71]) },
      likesPizza: { BOOL: false },
      missing: { NULL: true },
    });

    // Then every value comes back as it went in, digits and bytes included.
    assertIdentical(attributes["name"]?.S, "Foo McBar");
    assertIdentical(attributes["empty"]?.S, "");
    assertIdentical(attributes["counter"]?.N, "9007199254740993");
    assertArrayEquals([...(attributes["picture"]?.B ?? [])], [137, 80, 78, 71]);
    assertFalse(attributes["likesPizza"]?.BOOL);
    assertTrue(attributes["missing"]?.NULL);
  });

  it("round trips sets, lists and maps", () => {
    // When an item carrying each collection kind is written and read back.
    const attributes = roundTrip({
      colours: { SS: ["purple", "red"] },
      luckyNumbers: { NS: ["7", "13", "42"] },
      tags: { BS: [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6])] },
      shopping: { L: [{ S: "milk" }, { N: "2" }] },
      address: { M: { city: { S: "London" }, postcode: { S: "AB1 2CD" } } },
    });

    // Then the members come back in the order they were given.
    assertArrayEquals(attributes["colours"]?.SS, ["purple", "red"]);
    assertArrayEquals(attributes["luckyNumbers"]?.NS, ["7", "13", "42"]);
    assertIdentical(attributes["tags"]?.BS?.length, 2);
    assertIdentical(attributes["shopping"]?.L?.[1]?.N, "2");
    assertObjectEquals(attributes["address"]?.M, {
      city: { S: "London" },
      postcode: { S: "AB1 2CD" },
    });
  });

  it("normalises the numbers in a number set", () => {
    // When a number set carries numbers written loosely.
    const attributes = roundTrip({ readings: { NS: ["1.50", "0007", "2e2"] } });

    // Then each member comes back normalised.
    assertArrayEquals(attributes["readings"]?.NS, ["1.5", "7", "200"]);
  });
});
