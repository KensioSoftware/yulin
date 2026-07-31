import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertStringStartsWith,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";
import { SimDynamoDbDocumentPathParser } from "./sim-dynamodb-document-path-parser.js";
import type { SimDynamoDbDocumentPath } from "./sim-dynamodb-document-path.js";
import { SimDynamoDbExpressionPlaceholders } from "./sim-dynamodb-expression-placeholders.js";
import { SimDynamoDbExpressionTokeniser } from "./sim-dynamodb-expression-tokeniser.js";
import { SimDynamoDbExpressionTokens } from "./sim-dynamodb-expression-tokens.js";

const expressionName = "ProjectionExpression";

/**
 * Parse one document path, with whatever names it uses defined for it.
 */
function parsePath(
  expression: string,
  entries?: Readonly<Record<string, string>>,
): SimDynamoDbDocumentPath {
  const tokens = new SimDynamoDbExpressionTokens({
    expressionName,
    tokens: new SimDynamoDbExpressionTokeniser({ expressionName }).tokenise(
      expression,
    ),
  });

  return new SimDynamoDbDocumentPathParser({
    tokens,
    names: new SimDynamoDbExpressionPlaceholders({
      parameterName: "ExpressionAttributeNames",
      marker: "#",
      entries,
    }),
  }).parse();
}

describe("SimDynamoDbDocumentPathParser", () => {
  it("reads dot dereferencing and list indexing", () => {
    // Given a path reaching into a map and then into a list inside it.
    // When it is parsed.
    const path = parsePath("order.lines[2].sku");

    // Then each step is what it points at, rather than text to split later.
    assertArrayLength(path.segments, 4);
    assertIdentical(path.segments.at(0)?.kind, "attribute");
    assertIdentical(path.segments.at(2)?.kind, "index");
    assertIdentical(path.depth, 4);
    assertIdentical(path.text, "order.lines[2].sku");
  });

  it("reads an index of zero", () => {
    // Given the first element of a list, which is the index a boundary check
    // written the wrong way round would refuse.
    // When it is parsed, then it is an index of zero.
    const path = parsePath("lines[0]");

    assertIdentical(path.text, "lines[0]");
  });

  it("substitutes a name placeholder for the attribute it stands for", () => {
    // Given a path written with placeholders, as a path naming a reserved word
    // has to be.
    // When it is parsed with those names defined.
    const path = parsePath("#o.#s", { "#o": "order", "#s": "status" });

    // Then the path names the attributes rather than the placeholders, so
    // everything after it reads one kind of path.
    assertIdentical(path.text, "order.status");
  });

  it("refuses a negative list index", () => {
    // Given a path indexing backwards, which DynamoDB lists do not do.
    // When it is parsed, then it is refused naming the path it was reading.
    const error = assertThrowsError(() => parsePath("lines[-1]"));

    assertInstanceOf(error, SimDynamoDbValidationException);
    assertIdentical(
      error.message,
      "Invalid ProjectionExpression: a list index cannot be negative in the " +
        "document path 'lines'",
    );
  });

  it("refuses a fractional list index", () => {
    // Given a path indexing at a fraction, which is between two elements.
    // When it is parsed, then it is refused naming the path it was reading.
    const error = assertThrowsError(() => parsePath("lines[1.5]"));

    assertIdentical(
      error.message,
      "Invalid ProjectionExpression: a list index is a whole number, and " +
        "'1.5' is not in the document path 'lines'",
    );
  });

  it("refuses a path deeper than an item nests", () => {
    // Given a path of 33 attributes, one past where an item can go.
    const tooDeep = Array.from(
      { length: 33 },
      (_, index) => `a${String(index)}`,
    ).join(".");

    // When it is parsed, then it is refused: nothing could ever be there.
    const error = assertThrowsError(() => parsePath(tooDeep));

    assertStringStartsWith(
      error.message,
      "Invalid ProjectionExpression: a document path goes at most 32 levels " +
        "deep",
    );
  });

  it("reads a path of exactly 32 levels", () => {
    // Given a path at the deepest an item nests.
    const deepest = Array.from(
      { length: 32 },
      (_, index) => `a${String(index)}`,
    ).join(".");

    // When it is parsed, then it is read rather than refused, so the cap is
    // the limit rather than one short of it.
    assertIdentical(parsePath(deepest).depth, 32);
  });

  it("refuses a list index with no closing bracket", () => {
    // Given a path that opens an index and never closes it.
    // When it is parsed, then it is refused rather than read to the end.
    const error = assertThrowsError(() => parsePath("lines[0"));

    assertIdentical(
      error.message,
      "Invalid ProjectionExpression: a list index has no closing ']' in the " +
        "document path 'lines'",
    );
  });

  it("refuses a dot with nothing after it", () => {
    // Given a path that dereferences into nothing.
    // When it is parsed, then it is refused saying what was expected.
    const error = assertThrowsError(() => parsePath("order."));

    assertIdentical(
      error.message,
      "Invalid ProjectionExpression: syntax error; an attribute name " +
        "expected, but the expression ended",
    );
  });

  it("refuses a path that does not start with an attribute name", () => {
    // Given a path opening with a list index, which points at nothing: an item
    // is a map of attributes rather than a list.
    // When it is parsed, then it is refused with nothing read yet, so there is
    // no path to name in the refusal.
    const error = assertThrowsError(() => parsePath("[0]"));

    assertIdentical(
      error.message,
      "Invalid ProjectionExpression: syntax error; an attribute name was " +
        "expected, but '[' was given",
    );
  });

  it("refuses something that is not an attribute name where one belongs", () => {
    // Given a path dereferencing into a number, which is not an attribute
    // name in an expression.
    // When it is parsed, then it is refused naming what was given.
    const error = assertThrowsError(() => parsePath("order.1"));

    assertIdentical(
      error.message,
      "Invalid ProjectionExpression: syntax error; an attribute name was " +
        "expected in the document path 'order', but '1' was given",
    );
  });
});
