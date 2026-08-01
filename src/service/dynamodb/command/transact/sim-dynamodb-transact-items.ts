import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";

/**
 * Real DynamoDB takes 100 actions in one transaction, whether it is reading or
 * writing them.
 */
const greatestActions = 100;

/**
 * Refuse a transaction with nothing to do, or with more than DynamoDB applies
 * at once.
 *
 * The count is checked before the actions are read, so a transaction that is
 * too long is told so rather than told about the first action in it that has
 * something else wrong.
 */
export function assertSimDynamoDbTransactItemCount(
  count: number,
  operation: string,
): void {
  if (count === 0) {
    throw new SimDynamoDbValidationException(
      `${operation} requires TransactItems naming at least one action`,
    );
  }

  if (count > greatestActions) {
    throw new SimDynamoDbValidationException(
      `Too many items requested for the ${operation} call: ` +
        `${count.toString()} actions, where ${greatestActions.toString()} is ` +
        `the most a transaction takes`,
    );
  }
}
