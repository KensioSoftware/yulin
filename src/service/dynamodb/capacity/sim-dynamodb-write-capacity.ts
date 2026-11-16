import { jsonStringify } from "../../../util/type-guard/json.js";
import type { SimDynamoDbItem } from "../item/sim-dynamodb-item.js";
import type { SimDynamoDbSecondaryIndex } from "../secondary-index/sim-dynamodb-secondary-index.js";
import type { SimDynamoDbTable } from "../table/sim-dynamodb-table.js";
import {
  type SimDynamoDbCapacityTally,
  type SimDynamoDbCapacityTarget,
  simDynamoDbTableTarget,
} from "./sim-dynamodb-capacity-tally.js";
import { simDynamoDbWriteUnits } from "./sim-dynamodb-capacity-units.js";

/**
 * One write to an item, as the item stood before and after it.
 *
 * A put of a new key has nothing before, and a delete has nothing after. A
 * write that changed nothing, such as a condition check, has the same item on
 * both sides.
 */
export interface SimDynamoDbItemWrite {
  readonly before: SimDynamoDbItem | undefined;
  readonly after: SimDynamoDbItem | undefined;
}

/**
 * Charge one write to the table and to each index it changes.
 *
 * The table is charged for the larger of the item before and after, rounded up
 * to the next 1 KB. An index is charged for its own entry, which is the item
 * cut down to what the index projects. An entry that appears or goes is one
 * write, an entry whose index key changes is two (the old one deleted and the
 * new one put), and an entry that only changes in what it projects is one. An
 * index whose entry is unchanged costs nothing.
 */
export function simDynamoDbChargeWrite(
  tally: SimDynamoDbCapacityTally,
  table: SimDynamoDbTable,
  write: SimDynamoDbItemWrite,
  transactional: boolean,
): void {
  const bytes = Math.max(sizeOf(write.before), sizeOf(write.after));

  tally.write(
    simDynamoDbTableTarget,
    simDynamoDbWriteUnits(bytes, transactional),
  );

  // An index the write leaves alone is not charged, so it is not reported.
  for (const [target, index] of indexesOf(table)) {
    for (const entry of indexEntries(table, index, write)) {
      tally.write(target, simDynamoDbWriteUnits(entry, transactional));
    }
  }
}

/**
 * Every index on a table, with where its capacity is charged.
 */
function indexesOf(
  table: SimDynamoDbTable,
): readonly (readonly [
  SimDynamoDbCapacityTarget,
  SimDynamoDbSecondaryIndex,
])[] {
  return [
    ...table.indexes.global.elements.map(
      (index) => [{ kind: "global", name: index.name }, index] as const,
    ),
    ...table.indexes.local.elements.map(
      (index) => [{ kind: "local", name: index.name }, index] as const,
    ),
  ];
}

/**
 * The sizes of the index entries one write puts or deletes.
 */
function indexEntries(
  table: SimDynamoDbTable,
  index: SimDynamoDbSecondaryIndex,
  write: SimDynamoDbItemWrite,
): readonly number[] {
  const view = table.view(index.name);
  const keyNames = index.keySchema.attributeNames();
  const before = entryOf(write.before, keyNames, (item) => view.project(item));
  const after = entryOf(write.after, keyNames, (item) => view.project(item));

  if (before === undefined || after === undefined) {
    return [before, after].flatMap((entry) =>
      entry === undefined ? [] : [entry.sizeInBytes()],
    );
  }

  if (signature(before, keyNames) !== signature(after, keyNames)) {
    return [before.sizeInBytes(), after.sizeInBytes()];
  }

  return signature(before) === signature(after)
    ? []
    : [Math.max(before.sizeInBytes(), after.sizeInBytes())];
}

/**
 * The entry an item has in an index, or nothing when it lacks a key attribute
 * the index is keyed by.
 */
function entryOf(
  item: SimDynamoDbItem | undefined,
  keyNames: readonly string[],
  project: (item: SimDynamoDbItem) => SimDynamoDbItem,
): SimDynamoDbItem | undefined {
  if (item === undefined) {
    return undefined;
  }

  return keyNames.every((name) => item.attribute(name) !== undefined)
    ? project(item)
    : undefined;
}

/**
 * A stable string for an entry, or for the named attributes of it.
 */
function signature(
  entry: SimDynamoDbItem,
  names: readonly string[] = entry.attributeNames(),
): string {
  return jsonStringify(
    Object.entries(entry.toAttributeValues())
      .filter(([name]) => names.includes(name))
      .toSorted(([left], [right]) => left.localeCompare(right)),
  );
}

function sizeOf(item: SimDynamoDbItem | undefined): number {
  return item?.sizeInBytes() ?? 0;
}
