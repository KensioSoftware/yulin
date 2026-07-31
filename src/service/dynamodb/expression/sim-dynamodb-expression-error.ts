import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";

/**
 * Build the error one expression parameter is refused with.
 *
 * Real DynamoDB names the parameter that was wrong before saying what was wrong
 * with it, because a request can carry several expressions at once. Every
 * refusal here goes through this, so they all read the same way.
 */
export function simDynamoDbExpressionError(
  expressionName: string,
  reason: string,
): SimDynamoDbValidationException {
  return new SimDynamoDbValidationException(
    `Invalid ${expressionName}: ${reason}`,
  );
}
