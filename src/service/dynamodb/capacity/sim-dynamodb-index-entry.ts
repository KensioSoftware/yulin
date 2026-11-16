import type { SimDynamoDbItem } from "../item/sim-dynamodb-item.js";
import type { SimDynamoDbSecondaryIndex } from "../secondary-index/sim-dynamodb-secondary-index.js";
import type { SimDynamoDbTable } from "../table/sim-dynamodb-table.js";

/**
 * Cut items down to the entries one index holds for them.
 *
 * A read view of the index would do the same, but building one refuses an
 * index still being created. A write is charged for that index all the same,
 * and is measured after it has been made, so the projection is taken from the
 * index's definition alone.
 */
export function simDynamoDbIndexEntry(
  table: SimDynamoDbTable,
  index: SimDynamoDbSecondaryIndex,
): (item: SimDynamoDbItem) => SimDynamoDbItem {
  const attributes = index.attributesOf(
    new Set([
      ...index.keySchema.attributeNames(),
      ...table.keySchema.attributeNames(),
    ]),
  );

  return (item) => attributes.project(item);
}

/**
 * The bytes an item's entries in some indexes take, counting only the indexes
 * that hold it.
 *
 * An item lacking one of an index's key attributes has no entry in it, since
 * an index of either kind is sparse.
 */
export function simDynamoDbIndexEntriesSize(
  table: SimDynamoDbTable,
  indexes: readonly SimDynamoDbSecondaryIndex[],
): (item: SimDynamoDbItem) => number {
  const entries = indexes.map((index) => ({
    keyNames: index.keySchema.attributeNames(),
    project: simDynamoDbIndexEntry(table, index),
  }));

  return (item) =>
    entries
      .filter(({ keyNames }) =>
        keyNames.every((name) => item.attribute(name) !== undefined),
      )
      .reduce((sum, { project }) => sum + project(item).sizeInBytes(), 0);
}
