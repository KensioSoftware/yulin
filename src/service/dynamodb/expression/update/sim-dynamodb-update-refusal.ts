import type { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import { simDynamoDbExpressionError } from "../sim-dynamodb-expression-error.js";

/**
 * The request parameter an update expression arrives in, which every refusal
 * names.
 */
export const updateExpressionName = "UpdateExpression";

/**
 * Refuse an update expression DynamoDB would refuse too.
 */
export function simDynamoDbUpdateError(
  reason: string,
): SimDynamoDbValidationException {
  return simDynamoDbExpressionError(updateExpressionName, reason);
}
