import { SimDynamoDbResourceNotFoundException } from "../error/dynamodb.error.js";
import type { SimDynamoDbSecondaryIndex } from "./sim-dynamodb-secondary-index.js";

/**
 * The index an `IndexName` names, refusing a name the table does not have.
 *
 * Real DynamoDB answers a name it does not have with
 * `ResourceNotFoundException` rather than reading the table instead, since a
 * read of an index that is not there is a read of nothing.
 *
 * The two kinds share one namespace, so the lookup is over both of them at once
 * rather than over either collection.
 */
export function requiredSimDynamoDbIndex(
  elements: readonly SimDynamoDbSecondaryIndex[],
  indexName: string,
  tableName: string,
): SimDynamoDbSecondaryIndex {
  const index = elements.find((candidate) => candidate.name === indexName);

  if (index === undefined) {
    throw new SimDynamoDbResourceNotFoundException(
      `The table ${tableName} does not have the specified index: ${indexName}`,
    );
  }

  return index;
}
