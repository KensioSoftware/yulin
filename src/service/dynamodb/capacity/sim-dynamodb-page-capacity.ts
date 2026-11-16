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
  const { input, table, evaluated, sizeOf } = properties;
  const tally = new SimDynamoDbCapacityTally(
    input.TableName ?? table.tableName,
  );

  tally.read(
    readTarget(table, input.IndexName),
    simDynamoDbReadUnits(
      evaluated.reduce((total, item) => total + sizeOf(item), 0),
      simDynamoDbReadConsistency(input.ConsistentRead),
    ),
  );

  return SimDynamoDbReturnConsumedCapacity.read(
    input.ReturnConsumedCapacity,
  ).one(tally);
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
