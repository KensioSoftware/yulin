import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";
import type { SimDynamoDbExpressionToken } from "./sim-dynamodb-expression-token.js";
import { SimDynamoDbExpressionTokeniser } from "./sim-dynamodb-expression-tokeniser.js";

function tokenise(expression: string): readonly SimDynamoDbExpressionToken[] {
  return new SimDynamoDbExpressionTokeniser({
    expressionName: "ProjectionExpression",
  }).tokenise(expression);
}

describe("SimDynamoDbExpressionTokeniser", () => {
  it("reads the pieces a document path is made of", () => {
    // Given an expression naming an attribute, a nested attribute and an
    // element of a list.
    // When it is tokenised.
    const tokens = tokenise("address.lines[10]");

    // Then each piece comes back with what it is, so a parser reads meaning
    // rather than characters.
    assertArrayLength(tokens, 6);
    assertIdentical(tokens.at(0)?.kind, "name");
    assertIdentical(tokens.at(0)?.text, "address");
    assertIdentical(tokens.at(1)?.kind, "symbol");
    assertIdentical(tokens.at(2)?.text, "lines");
    assertIdentical(tokens.at(3)?.text, "[");
    assertIdentical(tokens.at(4)?.kind, "number");
    assertIdentical(tokens.at(4)?.text, "10");
    assertIdentical(tokens.at(5)?.text, "]");
  });

  it("reads a name placeholder and a value placeholder with their markers", () => {
    // Given an expression using both kinds of placeholder.
    // When it is tokenised.
    const tokens = tokenise("#status, :wanted");

    // Then each keeps its marker, so a refusal names it as the request wrote
    // it.
    assertIdentical(tokens.at(0)?.kind, "namePlaceholder");
    assertIdentical(tokens.at(0)?.text, "#status");
    assertIdentical(tokens.at(1)?.text, ",");
    assertIdentical(tokens.at(2)?.kind, "valuePlaceholder");
    assertIdentical(tokens.at(2)?.text, ":wanted");
  });

  it("reads a fraction as one number", () => {
    // Given a list index written as a fraction, which is not an index.
    // When it is tokenised.
    const tokens = tokenise("[1.5]");

    // Then the fraction is one token, so whatever reads it can say the index
    // is not whole rather than fail somewhere after it.
    assertArrayLength(tokens, 3);
    assertIdentical(tokens.at(1)?.kind, "number");
    assertIdentical(tokens.at(1)?.text, "1.5");
  });

  it("skips whitespace between tokens and reports where each starts", () => {
    // Given an expression with spaces around its comma, as a request written
    // by hand usually has.
    // When it is tokenised.
    const tokens = tokenise("  id ,  note");

    // Then the spaces are gone, and each token knows where it came from.
    assertArrayLength(tokens, 3);
    assertIdentical(tokens.at(0)?.position, 2);
    assertIdentical(tokens.at(1)?.position, 5);
    assertIdentical(tokens.at(2)?.position, 8);
  });

  it("reads an empty expression as no tokens", () => {
    // Given an expression with nothing in it.
    // When it is tokenised, then there is nothing to read, which is left for
    // the parser to refuse in its own terms.
    assertArrayLength(tokenise(" ".repeat(3)), 0);
  });

  it("refuses a placeholder marker naming nothing", () => {
    // Given a bare marker, which stands for no placeholder at all.
    // When it is tokenised, then it is refused rather than read as a marker on
    // its own.
    const error = assertThrowsError(() => tokenise("#"));

    assertInstanceOf(error, SimDynamoDbValidationException);
    assertIdentical(
      error.message,
      "Invalid ProjectionExpression: syntax error; the placeholder marker " +
        "'#' names nothing",
    );
  });

  it("reads a two character operator as one operator", () => {
    // Given the comparators written with two characters, which a reader
    // taking one character at a time would split.
    // When they are tokenised.
    const tokens = tokenise("a <= b >= c <> d = e");

    // Then each is one token, so a parser reads `<=` rather than `<` and `=`.
    assertIdentical(tokens.at(1)?.text, "<=");
    assertIdentical(tokens.at(3)?.text, ">=");
    assertIdentical(tokens.at(5)?.text, "<>");
    assertIdentical(tokens.at(7)?.text, "=");
  });

  it("refuses a character that means nothing in an expression", () => {
    // Given an expression carrying a character no supported expression uses.
    // When it is tokenised, then it is refused rather than passed through to a
    // parser that would ignore it.
    const error = assertThrowsError(() => tokenise("id * 3"));

    assertInstanceOf(error, SimDynamoDbValidationException);
    assertIdentical(
      error.message,
      "Invalid ProjectionExpression: syntax error; unexpected character '*'",
    );
  });

  it("names the expression it was reading in a refusal", () => {
    // Given a tokeniser reading some other expression parameter.
    const tokeniser = new SimDynamoDbExpressionTokeniser({
      expressionName: "ConditionExpression",
    });

    // When it refuses something, then the refusal names that parameter, since
    // one request can carry several expressions.
    const error = assertThrowsError(() => tokeniser.tokenise("%"));

    assertIdentical(
      error.message,
      "Invalid ConditionExpression: syntax error; unexpected character '%'",
    );
  });
});
