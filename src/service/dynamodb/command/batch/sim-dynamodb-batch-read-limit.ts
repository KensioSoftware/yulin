import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import type { SimDynamoDbKeysAndAttributes } from "./batch.command.js";
import type { SimDynamoDbBatchTableRequest } from "./sim-dynamodb-batch-request-items.js";

/**
 * Real DynamoDB reads 100 items in one batch, counted across every table the
 * request names rather than per table.
 */
const greatestKeys = 100;

/**
 * Refuse a batch asking for more items than DynamoDB reads at once.
 */
export function assertSimDynamoDbBatchReadLimit(
  tables: readonly SimDynamoDbBatchTableRequest<SimDynamoDbKeysAndAttributes>[],
  operation: string,
): void {
  const total = tables.reduce(
    (count, { requested }) => count + (requested.Keys ?? []).length,
    0,
  );

  if (total > greatestKeys) {
    throw new SimDynamoDbValidationException(
      `Too many items requested for the ${operation} call: ${total.toString()} ` +
        `keys, where ${greatestKeys.toString()} is the most a batch reads`,
    );
  }
}
