import { SimDynamoDbGlobalSecondaryIndex } from "../secondary-index/sim-dynamodb-global-secondary-index.js";
import { assertSimDynamoDbIndexAddable } from "../secondary-index/sim-dynamodb-index-limits.js";
import type { SimDynamoDbAttributeDefinitions } from "./sim-dynamodb-attribute-definitions.js";
import type { SimDynamoDbIndexUpdate } from "./sim-dynamodb-index-update.js";
import type { SimDynamoDbUpdatableTable } from "./sim-dynamodb-updatable-table.js";

/**
 * Build the index an UpdateTable adds, checked against the table it goes onto.
 *
 * The definitions are the merged ones rather than the table's, since the key
 * attributes of a new index are declared on the same call that adds it.
 */
export function simDynamoDbCreatedIndex(
  indexUpdate: SimDynamoDbIndexUpdate,
  table: SimDynamoDbUpdatableTable,
  attributeDefinitions: SimDynamoDbAttributeDefinitions,
): SimDynamoDbGlobalSecondaryIndex | undefined {
  if (indexUpdate.created === undefined) {
    return undefined;
  }

  const index = SimDynamoDbGlobalSecondaryIndex.added(indexUpdate.created, {
    tableArn: table.arn,
    keySchema: table.keySchema,
    billing: table.billing,
  });

  attributeDefinitions.assertDefines(index.keySchema);
  assertSimDynamoDbIndexAddable(table.indexes.elements, index);

  return index;
}

/**
 * The name of the index an UpdateTable removes, refusing one the table lacks.
 */
export function simDynamoDbDeletedIndexName(
  indexUpdate: SimDynamoDbIndexUpdate,
  table: SimDynamoDbUpdatableTable,
): string | undefined {
  if (indexUpdate.deletedName === undefined) {
    return undefined;
  }

  return table.indexes.global.required(indexUpdate.deletedName, table.tableName)
    .name;
}
