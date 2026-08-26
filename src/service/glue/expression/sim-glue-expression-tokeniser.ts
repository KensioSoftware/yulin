import { simGlueExpressionError } from "./sim-glue-expression-error.js";
import type { SimGlueExpressionToken } from "./sim-glue-expression-token.js";
import { simGlueReadExpressionToken } from "./sim-glue-expression-token-reader.js";

/**
 * Read an `Expression` into the tokens a parser walks.
 *
 * Whitespace between tokens means nothing and is dropped here. Everything
 * about what one token looks like belongs to the reader.
 */
export function simGlueExpressionTokens(
  expression: string,
): readonly SimGlueExpressionToken[] {
  const tokens: SimGlueExpressionToken[] = [];
  let position = 0;

  while (position < expression.length) {
    if (/\s/.test(expression.charAt(position))) {
      position += 1;
      continue;
    }

    const read = simGlueReadExpressionToken(expression, position);

    tokens.push(read.token);
    position = read.next;
  }

  if (tokens.length === 0) {
    throw simGlueExpressionError(
      "an expression with nothing in it filters nothing",
      "at position 0",
    );
  }

  return tokens;
}
