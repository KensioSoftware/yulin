import { SimGlueInvalidInputException } from "../error/sim-glue.error.js";
import type { SimGlueExpressionToken } from "./sim-glue-expression-token.js";

/**
 * Build the error a `GetPartitions` `Expression` is refused with.
 *
 * Every refusal says where reading stopped. An expression is written by hand
 * far more often than a partition is, and a message naming only the problem
 * leaves the caller counting brackets.
 */
export function simGlueExpressionError(
  reason: string,
  where: string,
): SimGlueInvalidInputException {
  return new SimGlueInvalidInputException(
    `Invalid Expression: ${reason}, ${where}`,
  );
}

/** Where a token sits, as a refusal says it. */
export function simGlueExpressionAt(
  token: SimGlueExpressionToken | undefined,
): string {
  return token === undefined
    ? "at the end of the expression"
    : simGlueExpressionAtPosition(token.position);
}

/** Where reading stopped, as a refusal says it. */
export function simGlueExpressionAtPosition(position: number): string {
  return `at position ${String(position)}`;
}
