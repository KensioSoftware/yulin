import type { SimDynamoDbItem } from "../item/sim-dynamodb-item.js";
import type { SimDynamoDbTable } from "../table/sim-dynamodb-table.js";
import {
  SimDynamoDbCapacityTally,
  type SimDynamoDbCapacityTarget,
  simDynamoDbTableTarget,
} from "./sim-dynamodb-capacity-tally.js";
import {
  simDynamoDbReadConsistency,
  simDynamoDbReadUnits,
} from "./sim-dynamodb-capacity-units.js";
import type { SimDynamoDbConsumedCapacity } from "./sim-dynamodb-consumed-capacity.types.js";
import { simDynamoDbIndexEntry } from "./sim-dynamodb-index-entry.js";
import { SimDynamoDbReturnConsumedCapacity } from "./sim-dynamodb-return-consumed-capacity.js";

interface SimDynamoDbPageCapacityProperties {
  readonly input: {
    readonly TableName?: string | undefined;
    readonly IndexName?: string | undefined;
    readonly ConsistentRead?: boolean | undefined;
    readonly ReturnConsumedCapacity?: string | undefined;
  };
  readonly table: SimDynamoDbTable;

  /** The items the page evaluated, before any filter dropped one. */
  readonly evaluated: readonly SimDynamoDbItem[];

  /** The bytes one item adds to the page, as the page's 1 MB counts it. */
  readonly sizeOf: (item: SimDynamoDbItem) => number;
}

/**
 * The `ConsumedCapacity` one Query or Scan page answers with.
 *
 * A page is one read of the items it evaluated, so their sizes are added up
 * before the total is rounded to the next 4 KB. A filter drops items after
 * they are read, so it saves nothing. A read of an index is charged to the
 * index.
 */
export function simDynamoDbPageCapacity(
  properties: SimDynamoDbPageCapacityProperties,
): { readonly ConsumedCapacity?: SimDynamoDbConsumedCapacity } {
  return SimDynamoDbReturnConsumedCapacity.read(
    properties.input.ReturnConsumedCapacity,
  ).one(() => measurePage(properties));
}

/**
 * Add up what one page consumed.
 *
 * An item a local secondary index read fetched from the table is charged to
 * the table as a read of its own, rounded up to the next 4 KB, and its index
 * entry is charged to the index with the rest.
 */
function measurePage(
  properties: SimDynamoDbPageCapacityProperties,
): SimDynamoDbCapacityTally {
  const { input, table, evaluated, sizeOf } = properties;
  const tally = new SimDynamoDbCapacityTally(
    input.TableName ?? table.tableName,
  );
  const consistency = simDynamoDbReadConsistency(input.ConsistentRead);
  const entrySize = entrySizer(table, input.IndexName);
  let entries = 0;

  for (const item of evaluated) {
    const read = sizeOf(item);
    const entry = Math.min(read, entrySize(item));

    entries += entry;

    if (read > entry) {
      tally.read(
        simDynamoDbTableTarget,
        simDynamoDbReadUnits(read, consistency),
      );
    }
  }

  tally.read(
    readTarget(table, input.IndexName),
    simDynamoDbReadUnits(entries, consistency),
  );

  return tally;
}

/**
 * The size of an item's entry in the index being read, or no limit when the
 * read is of the table.
 */
function entrySizer(
  table: SimDynamoDbTable,
  indexName: string | undefined,
): (item: SimDynamoDbItem) => number {
  const index = table.indexes.elements.find(({ name }) => name === indexName);

  if (index === undefined) {
    return () => Infinity;
  }

  const project = simDynamoDbIndexEntry(table, index);

  return (item) => project(item).sizeInBytes();
}

/**
 * Where a read is charged: the table, or the index the request named.
 */
function readTarget(
  table: SimDynamoDbTable,
  indexName: string | undefined,
): SimDynamoDbCapacityTarget {
  if (indexName === undefined) {
    return simDynamoDbTableTarget;
  }

  const local = table.indexes.local.elements.some(
    (index) => index.name === indexName,
  );

  return { kind: local ? "local" : "global", name: indexName };
}
