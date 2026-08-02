import type { SimDynamoDbItem } from "../item/sim-dynamodb-item.js";
import { SimDynamoDbIndexView } from "../secondary-index/sim-dynamodb-index-view.js";
import type { SimDynamoDbSecondaryIndexes } from "../secondary-index/sim-dynamodb-secondary-indexes.js";
import type { SimDynamoDbAttributeDefinitions } from "./sim-dynamodb-attribute-definitions.js";
import type { SimDynamoDbItemKey } from "./sim-dynamodb-item-key.js";
import type { SimDynamoDbKeySchema } from "./sim-dynamodb-key-schema.js";
import type { SimDynamoDbReadView } from "./sim-dynamodb-read-view.js";
import { SimDynamoDbTableView } from "./sim-dynamodb-table-view.js";

interface SimDynamoDbTableReadViewProperties {
  readonly tableName: string;
  readonly indexName: string | undefined;
  readonly items: readonly SimDynamoDbItem[];
  readonly keySchema: SimDynamoDbKeySchema;
  readonly attributeDefinitions: SimDynamoDbAttributeDefinitions;
  readonly indexes: SimDynamoDbSecondaryIndexes;
  readonly itemKey: SimDynamoDbItemKey;
}

/**
 * Build what a Query or a Scan reads: a table, or one of its indexes.
 *
 * An index is worked out here rather than kept up to date on the write path, so
 * a view is built per read from the items as they stand. An `IndexName` the
 * table does not have is refused rather than read as the table, and so is one
 * it is still building.
 */
export function simDynamoDbTableReadView(
  properties: SimDynamoDbTableReadViewProperties,
): SimDynamoDbReadView {
  const { tableName, indexName, items, keySchema, attributeDefinitions } =
    properties;

  if (indexName === undefined) {
    return new SimDynamoDbTableView({
      tableName,
      items,
      keySchema,
      attributeDefinitions,
      itemKey: properties.itemKey,
    });
  }

  return new SimDynamoDbIndexView({
    index: properties.indexes.required(indexName, tableName),
    items,
    tableKeySchema: keySchema,
    attributeDefinitions,
    tableItemKey: properties.itemKey,
  });
}
