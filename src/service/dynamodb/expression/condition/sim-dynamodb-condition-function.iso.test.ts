import { assertFalse, assertNonNullable, assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";

import type { SimDynamoDbAttributeValue } from "../../command/item/item.types.js";
import { SimDynamoDbItem } from "../../item/sim-dynamodb-item.js";
import { readSimDynamoDbCondition } from "./sim-dynamodb-condition-expression.js";
import { SimDynamoDbItemSnapshot } from "../sim-dynamodb-item-snapshot.js";

/**
 * The order these conditions are evaluated against.
 */
const order: Readonly<Record<string, SimDynamoDbAttributeValue>> = {
  orderId: { S: "order-1" },
  status: { S: "shipped" },
  version: { N: "2" },
  note: { NULL: true },
  tags: { SS: ["urgent", "gift"] },
  weights: { NS: ["1", "2"] },
  seals: { BS: [Uint8Array.from([7])] },
  lines: { L: [{ S: "widget" }, { S: "gasket" }] },
  address: { M: { city: { S: "Leeds" } } },
  label: { B: Uint8Array.from([1, 2, 3]) },
};

/**
 * The subject a condition is evaluated against.
 */
function subjectOf(
  item: Readonly<Record<string, SimDynamoDbAttributeValue>>,
): SimDynamoDbItemSnapshot {
  return new SimDynamoDbItemSnapshot(SimDynamoDbItem.fromAttributeValues(item));
}

/**
 * Whether a condition holds for the order.
 */
function holds(
  expression: string,
  values?: Readonly<Record<string, SimDynamoDbAttributeValue>>,
): boolean {
  const condition = readSimDynamoDbCondition({
    ConditionExpression: expression,
    ExpressionAttributeValues: values,
  });
  assertNonNullable(condition);

  return condition.holdsFor(subjectOf(order));
}

describe("DynamoDB condition expression functions", () => {
  it("finds an attribute that is there and one that is not", () => {
    // Given an order carrying some attributes and not others.
    // When existence is asked about, then each answers for what is there.
    assertTrue(holds("attribute_exists(status)"));
    assertFalse(holds("attribute_exists(discount)"));
    assertTrue(holds("attribute_not_exists(discount)"));
    assertFalse(holds("attribute_not_exists(status)"));
  });

  it("counts an attribute stored as NULL as existing", () => {
    // Given a note stored as NULL, which is a value in DynamoDB rather than an
    // absent one.
    // When existence is asked about, then the attribute is there.
    assertTrue(holds("attribute_exists(note)"));
    assertFalse(holds("attribute_not_exists(note)"));
  });

  it("finds an attribute nested inside a map or a list", () => {
    // Given an address map and a lines list.
    // When existence is asked about inside them, then each answers for what is
    // at that path.
    assertTrue(holds("attribute_exists(address.city)"));
    assertFalse(holds("attribute_exists(address.county)"));
    assertTrue(holds("attribute_exists(lines[1])"));
    assertFalse(holds("attribute_exists(lines[9])"));
  });

  it("checks the type an attribute is stored as", () => {
    // Given attributes of several types.
    // When attribute_type is asked, then it answers for the descriptor each is
    // stored under.
    assertTrue(
      holds("attribute_type(status, :type)", {
        ":type": { S: "S" },
      }),
    );
    assertFalse(
      holds("attribute_type(status, :type)", {
        ":type": { S: "N" },
      }),
    );
    assertTrue(holds("attribute_type(tags, :type)", { ":type": { S: "SS" } }));
    assertTrue(
      holds("attribute_type(note, :type)", { ":type": { S: "NULL" } }),
    );
    assertFalse(
      holds("attribute_type(discount, :type)", {
        ":type": { S: "S" },
      }),
    );
  });

  it("checks what a string or some binary starts with", () => {
    // Given a status and a binary label.
    // When begins_with is asked, then each answers for its own bytes, and a
    // string never begins with binary.
    assertTrue(
      holds("begins_with(status, :prefix)", {
        ":prefix": { S: "ship" },
      }),
    );
    assertFalse(
      holds("begins_with(status, :prefix)", {
        ":prefix": { S: "pack" },
      }),
    );
    assertTrue(
      holds("begins_with(label, :prefix)", {
        ":prefix": { B: Uint8Array.from([1, 2]) },
      }),
    );
    assertFalse(
      holds("begins_with(label, :prefix)", {
        ":prefix": { B: Uint8Array.from([1, 2, 3, 4]) },
      }),
    );
    assertFalse(
      holds("begins_with(status, :prefix)", {
        ":prefix": { B: Uint8Array.from([1]) },
      }),
    );
  });

  it("checks what a string, a set or a list holds", () => {
    // Given a string, a string set and a list.
    // When contains is asked, then a string looks for a substring and the
    // others look for a member.
    assertTrue(holds("contains(status, :part)", { ":part": { S: "hipp" } }));
    assertFalse(holds("contains(status, :part)", { ":part": { S: "packed" } }));
    assertTrue(holds("contains(tags, :tag)", { ":tag": { S: "gift" } }));
    assertFalse(holds("contains(tags, :tag)", { ":tag": { S: "boxed" } }));
    assertTrue(holds("contains(lines, :line)", { ":line": { S: "gasket" } }));
    assertFalse(holds("contains(version, :one)", { ":one": { N: "1" } }));
  });

  it("checks what a number set or a binary set holds", () => {
    // Given sets whose members compare by their digits and by their bytes.
    // When contains is asked, then each answers by value rather than by how
    // the member was written or by object identity.
    assertTrue(holds("contains(weights, :one)", { ":one": { N: "1.0" } }));
    assertFalse(holds("contains(weights, :nine)", { ":nine": { N: "9" } }));
    assertTrue(
      holds("contains(seals, :seal)", {
        ":seal": { B: Uint8Array.from([7]) },
      }),
    );
  });

  it("is false where a function's operand is not there", () => {
    // Given functions asked about an attribute the item does not carry.
    // When each is evaluated, then it is false rather than an error: nothing
    // begins with anything, and nothing contains anything.
    assertFalse(
      holds("begins_with(discount, :part)", {
        ":part": { S: "a" },
      }),
    );
    assertFalse(holds("contains(discount, :part)", { ":part": { S: "a" } }));
    assertFalse(holds("status IN (:part)", { ":part": { S: "a" } }));
    assertFalse(holds("discount IN (:part)", { ":part": { S: "a" } }));
  });

  it("is false for a path reaching into the wrong kind of value", () => {
    // Given a path reading a string as though it were a map, and a map as
    // though it were a list.
    // When each is evaluated, then the item simply does not have it.
    assertFalse(holds("attribute_exists(status.city)"));
    assertFalse(holds("attribute_exists(address[0])"));
    assertFalse(holds("attribute_exists(address.city.first)"));
  });

  it("compares the size of what a path points at", () => {
    // Given attributes measured in bytes and in members.
    // When size is compared, then a string and binary measure in bytes, and a
    // set, a list and a map in how many things they hold.
    assertTrue(holds("size(status) = :seven", { ":seven": { N: "7" } }));
    assertTrue(holds("size(label) = :three", { ":three": { N: "3" } }));
    assertTrue(holds("size(tags) = :two", { ":two": { N: "2" } }));
    assertTrue(holds("size(weights) = :two", { ":two": { N: "2" } }));
    assertTrue(holds("size(seals) = :one", { ":one": { N: "1" } }));
    assertTrue(holds("size(lines) = :two", { ":two": { N: "2" } }));
    assertTrue(holds("size(address) = :one", { ":one": { N: "1" } }));
    assertTrue(holds("size(status) > :one", { ":one": { N: "1" } }));
  });

  it("has no size for a number, a boolean or an absent attribute", () => {
    // Given a number, which has no size, and an attribute that is not there.
    // When size is compared, then it is false rather than an error.
    assertFalse(holds("size(version) > :zero", { ":zero": { N: "0" } }));
    assertFalse(holds("size(note) > :zero", { ":zero": { N: "0" } }));
    assertFalse(holds("size(discount) > :zero", { ":zero": { N: "0" } }));
  });

  it("counts a string's size in UTF-8 bytes", () => {
    // Given a status of seven ASCII characters, and the item's other text.
    // When size is compared against the character count of something outside
    // ASCII, then the bytes win: DynamoDB measures a string in bytes.
    const condition = readSimDynamoDbCondition({
      ConditionExpression: "size(city) = :three",
      ExpressionAttributeValues: { ":three": { N: "3" } },
    });
    assertNonNullable(condition);

    assertTrue(condition.holdsFor(subjectOf({ city: { S: "é!" } })));
  });

  it("reads a function name as an attribute when it is not a call", () => {
    // Given an item with an attribute named after a function, which is not a
    // reserved word.
    const condition = readSimDynamoDbCondition({
      ConditionExpression: "contains = :yes",
      ExpressionAttributeValues: { ":yes": { S: "yes" } },
    });
    assertNonNullable(condition);

    // When it is evaluated, then the name is read as the attribute, since
    // nothing follows it that could open a call.
    assertTrue(condition.holdsFor(subjectOf({ contains: { S: "yes" } })));
  });
});
