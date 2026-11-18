import { simDynamoDbTextSize } from "../item/sim-dynamodb-value-size.js";
import { simDynamoDbExpressionError } from "./sim-dynamodb-expression-error.js";
import type { SimDynamoDbExpressionToken } from "./sim-dynamodb-expression-token.js";

/**
 * The most bytes one expression string may hold, which AWS documents as 4 KB.
 */
const maximumExpressionBytes = 4096;

/**
 * The most operators and functions one expression may hold.
 */
const maximumOperators = 300;

/**
 * The comparators of the condition grammar, each one operator.
 */
const comparators: ReadonlySet<string> = new Set([
  "=",
  "<>",
  "<",
  "<=",
  ">",
  ">=",
]);

/**
 * The arithmetic an update expression can carry, each one operator.
 */
const arithmetic: ReadonlySet<string> = new Set(["+", "-"]);

/**
 * The keywords that count as one operator each.
 *
 * `BETWEEN` is missing on purpose. AWS counts it as one operator, and the `AND`
 * it is always written with is counted here in its place.
 */
const keywords: ReadonlySet<string> = new Set(["AND", "OR", "NOT", "IN"]);

/**
 * Refuse an expression string longer than AWS accepts.
 *
 * The size is counted in UTF-8 bytes, so `a=b` is 3 bytes and an attribute
 * name outside ASCII counts for more than its length.
 */
export function assertSimDynamoDbExpressionSize(
  expressionName: string,
  expression: string,
): void {
  // A request built without the SDK's types can carry anything here.
  if (typeof expression !== "string") {
    throw simDynamoDbExpressionError(
      expressionName,
      "the expression has to be a string",
    );
  }

  const size = simDynamoDbTextSize(expression);

  if (size > maximumExpressionBytes) {
    throw simDynamoDbExpressionError(
      expressionName,
      `Expression size has exceeded the maximum allowed size; expression ` +
        `size: ${size.toString()}`,
    );
  }
}

/**
 * Refuse an expression holding more operators and functions than AWS accepts.
 *
 * The `=` of a `SET` action is assignment and counts for nothing. Everywhere
 * else it is a comparator, and counts. AWS reports the count as 301 however
 * far over the limit the expression goes, so the refusal does the same.
 */
export function assertSimDynamoDbExpressionOperators(
  expressionName: string,
  tokens: readonly SimDynamoDbExpressionToken[],
): void {
  const countsEquals = expressionName !== "UpdateExpression";
  const operators = tokens.filter((token, index) =>
    isOperator(token, tokens.at(index + 1), countsEquals),
  ).length;

  if (operators > maximumOperators) {
    throw simDynamoDbExpressionError(
      expressionName,
      `The expression contains too many operators; operator count: ${(
        maximumOperators + 1
      ).toString()}`,
    );
  }
}

/**
 * Whether one token is an operator or a function by AWS's count.
 *
 * A function is a name followed straight away by an opening bracket.
 */
function isOperator(
  token: SimDynamoDbExpressionToken,
  next: SimDynamoDbExpressionToken | undefined,
  countsEquals: boolean,
): boolean {
  if (token.kind === "symbol") {
    return token.text === "="
      ? countsEquals
      : comparators.has(token.text) || arithmetic.has(token.text);
  }

  return (
    token.kind === "name" &&
    (keywords.has(token.text.toUpperCase()) || next?.text === "(")
  );
}
