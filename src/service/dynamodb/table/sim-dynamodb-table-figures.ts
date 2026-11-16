import { simDynamoDbIndexEntry } from "../capacity/sim-dynamodb-index-entry.js";
import type { SimDynamoDbItem } from "../item/sim-dynamodb-item.js";
import type { SimDynamoDbSecondaryIndex } from "../secondary-index/sim-dynamodb-secondary-index.js";
import type { SimDynamoDbTable } from "./sim-dynamodb-table.js";
import type {
  SimDynamoDbStoredFigures,
  SimDynamoDbTableFigures,
} from "./sim-dynamodb-table-statistics.js";

/**
 * Count the items a table holds, and the bytes they and their index entries
 * take.
 *
 * An index counts only the items carrying its key attributes, since an index of
 * either kind is sparse, and the bytes of each entry are the bytes of what it
 * projects.
 */
export function simDynamoDbTableFigures(
  table: SimDynamoDbTable,
  items: readonly SimDynamoDbItem[],
): SimDynamoDbTableFigures {
  return {
    ...figuresOf(items, (item) => item.sizeInBytes()),
    indexes: new Map(
      table.indexes.elements.map((index) => [
        index.name,
        indexFigures(table, index, items),
      ]),
    ),
  };
}

/**
 * Count the entries one index holds, and the bytes they take.
 */
function indexFigures(
  table: SimDynamoDbTable,
  index: SimDynamoDbSecondaryIndex,
  items: readonly SimDynamoDbItem[],
): SimDynamoDbStoredFigures {
  const keyNames = index.keySchema.attributeNames();
  const project = simDynamoDbIndexEntry(table, index);

  return figuresOf(
    items.filter((item) =>
      keyNames.every((name) => item.attribute(name) !== undefined),
    ),
    (item) => project(item).sizeInBytes(),
  );
}

/**
 * Count some items, and add up the bytes each takes.
 */
function figuresOf(
  items: readonly SimDynamoDbItem[],
  sizeOf: (item: SimDynamoDbItem) => number,
): SimDynamoDbStoredFigures {
  return {
    itemCount: items.length,
    sizeBytes: items.reduce((sum, item) => sum + sizeOf(item), 0),
  };
}
