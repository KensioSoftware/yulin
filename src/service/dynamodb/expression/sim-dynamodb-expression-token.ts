/**
 * What one piece of a DynamoDB expression is.
 *
 * A placeholder keeps its `#` or `:` in its text, so an error can name it the
 * way the request wrote it.
 */
export type SimDynamoDbExpressionTokenKind =
  "name" | "namePlaceholder" | "valuePlaceholder" | "number" | "symbol";

/**
 * One piece of a DynamoDB expression.
 *
 * The position is where the token starts in the expression text, so a refusal
 * can say where it went wrong rather than only what was wrong.
 */
export interface SimDynamoDbExpressionToken {
  readonly kind: SimDynamoDbExpressionTokenKind;
  readonly text: string;
  readonly position: number;
}
