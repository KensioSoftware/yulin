/**
 * What one piece of a `GetPartitions` `Expression` is.
 *
 * A string literal and a name are told apart here rather than by the parser,
 * since `day` and `'day'` mean a column and a value.
 */
export type SimGlueExpressionTokenKind =
  | "name"
  | "string"
  | "number"
  | "symbol";

/**
 * One piece of a `GetPartitions` `Expression`.
 *
 * The position is where the token starts in the expression text, so a refusal
 * can say where it stopped rather than only what was wrong.
 */
export interface SimGlueExpressionToken {
  readonly kind: SimGlueExpressionTokenKind;
  readonly text: string;
  readonly position: number;
}
