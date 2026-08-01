import type { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import { simDynamoDbExpressionError } from "../sim-dynamodb-expression-error.js";

/**
 * The request parameter every refusal here names.
 */
export const keyConditionExpressionName = "KeyConditionExpression";

/**
 * Build the error a key condition is refused with.
 *
 * A key condition is refused in two places: while it is being read, and again
 * once the table it names has been reached and its key schema is known. Both go
 * through this, so a caller reading the failure sees the same wording either
 * way.
 */
export function simDynamoDbKeyConditionError(
  reason: string,
): SimDynamoDbValidationException {
  return simDynamoDbExpressionError(keyConditionExpressionName, reason);
}
