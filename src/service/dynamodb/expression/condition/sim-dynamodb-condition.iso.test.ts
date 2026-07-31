import {
  assertFalse,
  assertNonNullable,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import type { SimDynamoDbAttributeValue } from "../../command/item/item.types.js";
import { SimDynamoDbItem } from "../../item/sim-dynamodb-item.js";
import { readSimDynamoDbCondition } from "./sim-dynamodb-condition-expression.js";
import { SimDynamoDbConditionSubject } from "./sim-dynamodb-condition-subject.js";

/**
 * The order this test guards conditions against.
 */
const order: Readonly<Record<string, SimDynamoDbAttributeValue>> = {
  orderId: { S: "order-1" },
  status: { S: "shipped" },
  version: { N: "2" },
  total: { N: "9007199254740993" },
  paid: { BOOL: true },
  note: { NULL: true },
};

/**
 * Whether a condition holds for an item, or for no item at all.
 */
function holdsFor(
  expression: string,
  values: Readonly<Record<string, SimDynamoDbAttributeValue>> | undefined,
  subject: SimDynamoDbConditionSubject,
): boolean {
  const condition = readSimDynamoDbCondition({
    ConditionExpression: expression,
    ExpressionAttributeValues: values,
  });
  assertNonNullable(condition);

  return condition.holdsFor(subject);
}

/**
 * Whether a condition holds for the order.
 */
function holds(
  expression: string,
  values?: Readonly<Record<string, SimDynamoDbAttributeValue>>,
): boolean {
  return holdsFor(
    expression,
    values,
    new SimDynamoDbConditionSubject(SimDynamoDbItem.fromAttributeValues(order)),
  );
}

/**
 * Whether a condition holds where the key holds nothing at all, which is what
 * a write into a free key is checked against.
 */
function holdsForNothing(
  expression: string,
  values?: Readonly<Record<string, SimDynamoDbAttributeValue>>,
): boolean {
  return holdsFor(expression, values, new SimDynamoDbConditionSubject());
}

describe("DynamoDB condition expressions", () => {
  it("evaluates the six comparators", () => {
    // Given an order whose version is 2.
    // When each comparator is evaluated against it, then each answers the way
    // arithmetic does.
    assertTrue(holds("version = :two", { ":two": { N: "2" } }));
    assertFalse(holds("version <> :two", { ":two": { N: "2" } }));
    assertTrue(holds("version < :three", { ":three": { N: "3" } }));
    assertTrue(holds("version <= :two", { ":two": { N: "2" } }));
    assertTrue(holds("version > :one", { ":one": { N: "1" } }));
    assertTrue(holds("version >= :two", { ":two": { N: "2" } }));
    assertFalse(holds("version > :two", { ":two": { N: "2" } }));
  });

  it("compares numbers past what a JavaScript number holds", () => {
    // Given a total one above the largest whole number a double carries
    // exactly, and a request naming the one below it.
    // When they are compared, then they differ, because the digits are
    // compared rather than converted.
    assertTrue(
      holds("total > :nearly", { ":nearly": { N: "9007199254740992" } }),
    );
  });

  it("compares two different types without refusing the request", () => {
    // Given comparisons between a string attribute and a number.
    // When they are evaluated, then none is an error, which is what real
    // DynamoDB does. Ordering has no answer across types, so it is false.
    assertFalse(holds("status = :one", { ":one": { N: "1" } }));
    assertFalse(holds("status < :one", { ":one": { N: "1" } }));
    assertFalse(holds("paid > :one", { ":one": { N: "1" } }));

    // And `<>` is true, because equality works across types and a string
    // really is not a number.
    assertTrue(holds("status <> :one", { ":one": { N: "1" } }));
  });

  it("is false for a path the item does not have", () => {
    // Given a comparison naming an attribute that is not there.
    // When it is evaluated, then it is false: nothing compares to anything.
    assertFalse(holds("discount = :one", { ":one": { N: "1" } }));
    assertFalse(holdsForNothing("version = :two", { ":two": { N: "2" } }));
  });

  it("evaluates BETWEEN with both bounds inside", () => {
    // Given a version of 2 and bounds of 2 and 4.
    // When BETWEEN is evaluated, then the lower bound counts as inside, and a
    // range that starts above the value does not.
    assertTrue(
      holds("version BETWEEN :two AND :four", {
        ":two": { N: "2" },
        ":four": { N: "4" },
      }),
    );
    assertFalse(
      holds("version BETWEEN :three AND :four", {
        ":three": { N: "3" },
        ":four": { N: "4" },
      }),
    );
  });

  it("evaluates IN against a list of candidates", () => {
    // Given a status of shipped and a list naming it among others.
    // When IN is evaluated, then it holds, and a list without it does not.
    assertTrue(
      holds("status IN (:packed, :shipped)", {
        ":packed": { S: "packed" },
        ":shipped": { S: "shipped" },
      }),
    );
    assertFalse(holds("status IN (:packed)", { ":packed": { S: "packed" } }));
  });

  it("binds NOT tighter than AND, and AND tighter than OR", () => {
    // Given an expression where swapping AND and OR changes the answer:
    // `false AND false OR true` is true read as `(false AND false) OR true`,
    // and false read as `false AND (false OR true)`.
    const values = {
      ":wrong": { S: "packed" },
      ":right": { S: "shipped" },
    } as const;

    // When it is evaluated, then AND binds tighter, so it holds.
    assertTrue(
      holds("status = :wrong AND status = :wrong OR status = :right", values),
    );

    // And brackets change it back, which is what says the precedence is doing
    // the work rather than the order the operators appear in.
    assertFalse(
      holds("status = :wrong AND (status = :wrong OR status = :right)", values),
    );

    // And NOT applies to what follows it rather than to the whole
    // expression: `NOT true OR true` is true read as `(NOT true) OR true`,
    // and false read as `NOT (true OR true)`.
    assertTrue(
      holds("NOT status = :right OR status = :right", {
        ":right": values[":right"],
      }),
    );
  });

  it("reads keywords in any case", () => {
    // Given an expression written in lower case, as generated code often is.
    // When it is evaluated, then it means the same, since DynamoDB reads its
    // keywords whatever case they are written in.
    assertTrue(
      holds("version between :one and :three or version = :nine", {
        ":one": { N: "1" },
        ":three": { N: "3" },
        ":nine": { N: "9" },
      }),
    );
    assertTrue(holds("not version = :nine", { ":nine": { N: "9" } }));
  });

  it("reads a path through a placeholder and into nested values", () => {
    // Given an item with a map and a list in it.
    const nested = {
      orderId: { S: "order-1" },
      address: { M: { city: { S: "Leeds" } } },
      lines: { L: [{ S: "widget" }] },
    } as const;

    // When a condition reaches into both, then it reads what is there.
    const condition = readSimDynamoDbCondition({
      ConditionExpression: "#a.city = :city AND lines[0] = :line",
      ExpressionAttributeNames: { "#a": "address" },
      ExpressionAttributeValues: {
        ":city": { S: "Leeds" },
        ":line": { S: "widget" },
      },
    });
    assertNonNullable(condition);

    const subject = new SimDynamoDbConditionSubject(
      SimDynamoDbItem.fromAttributeValues(nested),
    );

    assertTrue(condition.holdsFor(subject));
  });

  it("reads nothing for a request with no expression", () => {
    // Given a request that names no condition, which is an unconditional
    // write.
    // When the condition is read, then there is none to check.
    assertUndefined(readSimDynamoDbCondition({}));
  });
});
