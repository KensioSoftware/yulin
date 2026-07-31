import {
  SimDynamoDbUnsupportedOperation,
  type SimDynamoDbValidationException,
} from "../../error/dynamodb.error.js";
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

/**
 * Refuse part of an update expression real DynamoDB accepts and this simulation
 * does not model.
 *
 * This is deliberately not a ValidationException. The expression is a valid one,
 * so the refusal says the simulation stops short rather than that the request
 * was wrong.
 */
export function simDynamoDbUpdateUnsupported(
  what: string,
  reason: string,
): SimDynamoDbUnsupportedOperation {
  return new SimDynamoDbUnsupportedOperation(
    `${what} is not simulated, so UpdateItem refuses it rather than ${reason}`,
  );
}
