import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import type { SimDynamoDbAttributeValue } from "../../command/item/item.types.js";
import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import { readSimDynamoDbCondition } from "./sim-dynamodb-condition-expression.js";

/**
 * Read a condition, returning whatever it is refused with.
 */
function refusal(
  expression: string,
  values?: Readonly<Record<string, SimDynamoDbAttributeValue>>,
): Error {
  return assertThrowsError(() =>
    readSimDynamoDbCondition({
      ConditionExpression: expression,
      ExpressionAttributeValues: values,
    }),
  );
}

describe("DynamoDB condition expression validation", () => {
  it("refuses an empty expression", () => {
    // Given an expression saying nothing at all.
    // When it is read, then it is refused rather than read as a condition that
    // always holds.
    assertIdentical(
      refusal(" ".repeat(3)).message,
      "Invalid ConditionExpression: the expression says nothing, and an " +
        "expression cannot be empty",
    );
  });

  it("refuses a value placeholder the request never defined", () => {
    // Given a condition comparing against a value with no entry for it.
    // When it is read, then it is refused naming the placeholder.
    const error = refusal("version = :two");

    assertInstanceOf(error, SimDynamoDbValidationException);
    assertIdentical(
      error.message,
      "ExpressionAttributeValues does not define :two, which an expression " +
        "uses",
    );
  });

  it("refuses a defined value the expression never uses", () => {
    // Given values holding a placeholder an edited expression no longer uses.
    // When it is read, then the leftover is refused.
    const error = refusal("attribute_exists(status)", {
      ":two": { N: "2" },
    });

    assertIdentical(
      error.message,
      "Value provided in ExpressionAttributeValues is unused in " +
        "expressions: :two",
    );
  });

  it("refuses values with no expression to use them in", () => {
    // Given a request carrying values and no condition.
    // When the condition is read, then the values are refused, since nothing
    // would ever read them.
    const error = assertThrowsError(() =>
      readSimDynamoDbCondition({
        ExpressionAttributeValues: { ":two": { N: "2" } },
      }),
    );

    assertStringIncludes(
      error.message,
      "ExpressionAttributeValues can only be specified when using expressions",
    );
  });

  it("refuses names with no expression to use them in", () => {
    // Given a request carrying names and no condition.
    // When the condition is read, then the names are refused too, so neither
    // parameter is left behind.
    const error = assertThrowsError(() =>
      readSimDynamoDbCondition({
        ExpressionAttributeNames: { "#s": "status" },
      }),
    );

    assertStringIncludes(
      error.message,
      "ExpressionAttributeNames can only be specified when using expressions",
    );
  });

  it("refuses a comparison with no comparator", () => {
    // Given two operands with nothing between them.
    // When it is read, then it is refused saying a comparator was expected.
    assertStringIncludes(
      refusal("version :two", { ":two": { N: "2" } }).message,
      "a comparator was expected, but ':two' was given",
    );
  });

  it("refuses something left over after a complete condition", () => {
    // Given an expression with a stray operand after its condition.
    // When it is read, then it is refused rather than read up to the point it
    // stopped making sense.
    assertStringIncludes(
      refusal("attribute_exists(status) status").message,
      "'status' follows a complete condition",
    );
  });

  it("refuses a bracket that is never closed", () => {
    // Given a bracketed condition with no closing bracket.
    // When it is read, then it is refused.
    assertStringIncludes(
      refusal("(attribute_exists(status)").message,
      "a bracket is not closed",
    );
    assertStringIncludes(
      refusal("attribute_exists(status").message,
      "attribute_exists is not closed",
    );
    assertStringIncludes(
      refusal("size(status = :one", { ":one": { N: "1" } }).message,
      "size is not closed",
    );
  });

  it("refuses BETWEEN without its AND", () => {
    // Given a range missing the AND between its bounds.
    // When it is read, then it is refused saying what was expected.
    assertStringIncludes(
      refusal("version BETWEEN :one :three", {
        ":one": { N: "1" },
        ":three": { N: "3" },
      }).message,
      "AND expected, but ':three' was given",
    );
  });

  it("refuses an IN list that is not bracketed or not closed", () => {
    // Given IN written without its brackets, and with only an opening one.
    // When each is read, then both are refused.
    assertStringIncludes(
      refusal("status IN :one", { ":one": { S: "a" } }).message,
      "IN takes a bracketed list",
    );
    assertStringIncludes(
      refusal("status IN (:one", { ":one": { S: "a" } }).message,
      "the IN list is not closed",
    );
  });

  it("refuses an IN list longer than DynamoDB takes", () => {
    // Given an IN list of 101 operands, one past the limit.
    const values = Object.fromEntries(
      Array.from({ length: 101 }, (_, at) => [
        `:v${at.toString()}`,
        { S: at.toString() },
      ]),
    );
    const operands = Object.keys(values).join(", ");

    // When it is read, then it is refused rather than evaluated, since real
    // DynamoDB would refuse it too.
    assertStringIncludes(
      refusal(`status IN (${operands})`, values).message,
      "IN takes at most 100 operands, and 101 were given",
    );
  });

  it("refuses a function operand that has to be a path", () => {
    // Given attribute_exists asked about a supplied value, which names no
    // place in the item.
    // When it is read, then it is refused naming the function.
    assertStringIncludes(
      refusal("attribute_exists(:one)", { ":one": { S: "a" } }).message,
      "the first operand of attribute_exists names a place in the item",
    );
  });

  it("refuses a function that is missing its second operand", () => {
    // Given begins_with with only one operand.
    // When it is read, then it is refused.
    assertStringIncludes(
      refusal("begins_with(status)").message,
      "a second operand was expected, separated by a comma",
    );
  });

  it("refuses an attribute_type that does not name a type", () => {
    // Given attribute_type asked about something that is not one of the
    // descriptors, and about a path rather than a supplied value.
    // When each is read, then both are refused.
    assertStringIncludes(
      refusal("attribute_type(status, :type)", {
        ":type": { S: "STRING" },
      }).message,
      "the second operand of attribute_type is one of",
    );
    assertStringIncludes(
      refusal("attribute_type(status, other)").message,
      "the second operand of attribute_type is one of",
    );
  });

  it("refuses contains asked whether something contains itself", () => {
    // Given contains with the same operand twice, which has one answer
    // whatever the item holds.
    // When it is read, then it is refused, as real DynamoDB refuses it.
    assertStringIncludes(
      refusal("contains(tags, tags)").message,
      "the first operand must be distinct from the second operand for " +
        "operator contains",
    );

    // And a first operand naming no place in the item is refused before the
    // two are compared at all, since contains reads a path there.
    assertStringIncludes(
      refusal("contains(size(tags), size(tags))").message,
      "the first operand of contains names a place in the item",
    );
    assertStringIncludes(
      refusal("begins_with(:a, :b)", {
        ":a": { S: "a" },
        ":b": { S: "b" },
      }).message,
      "the first operand of begins_with names a place in the item",
    );
  });
});
