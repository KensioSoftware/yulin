import type { SimDynamoDbItem } from "../../item/sim-dynamodb-item.js";
import type { SimDynamoDbTable } from "../../table/sim-dynamodb-table.js";
import type { SimDynamoDbAttributeValue } from "../item/item.types.js";
import type { SimDynamoDbKeysAndAttributes } from "./batch.command.js";
import type { SimDynamoDbBatchReadBudget } from "./sim-dynamodb-batch-read-budget.js";
import type { SimDynamoDbBatchTableReads } from "./sim-dynamodb-batch-reads.js";
import { assertDistinctBatchItems } from "./sim-dynamodb-batch-request-items.js";
import type { SimDynamoDbBatchTable } from "./sim-dynamodb-batch-tables.js";
import {
  simDynamoDbReadConsistency,
  simDynamoDbReadUnits,
} from "../../capacity/sim-dynamodb-capacity-units.js";

/**
 * The items one table of a batch read answers with.
 */
type SimDynamoDbReadItems = readonly Readonly<
  Record<string, SimDynamoDbAttributeValue>
>[];

/**
 * What one table of the batch answered with, and what it left unread.
 */
export interface SimDynamoDbBatchTableRead {
  readonly reference: string;
  readonly items: SimDynamoDbReadItems;
  readonly unprocessed: SimDynamoDbKeysAndAttributes | undefined;

  /**
   * The read units the keys that were read consumed, whole items counted
   * whatever the projection kept, and a key that held nothing counted too.
   */
  readonly readUnits: number;
}

/**
 * Read what one table of the batch was asked for, as far as the response has
 * room for.
 *
 * DynamoDB reads a batch in parallel and answers in no particular order. The
 * items here come back in the order their keys were named, which is one of the
 * orders that is allowed rather than one that can be relied on. Which keys a
 * full response leaves unread is likewise this simulator's choice: the ones
 * named last.
 */
export function readSimDynamoDbBatchTable(
  reached: SimDynamoDbBatchTable<SimDynamoDbBatchTableReads>,
  budget: SimDynamoDbBatchReadBudget,
): SimDynamoDbBatchTableRead {
  const { table, requested } = reached;

  // Marshalling every key checks it against the table's key schema, and is
  // what tells two reads of one item apart.
  assertDistinctBatchItems(
    requested.keys.map((key) => table.keyOfKey(key)),
    requested.reference,
    "BatchGetItem",
  );

  const items: Readonly<Record<string, SimDynamoDbAttributeValue>>[] = [];
  const unreadKeys = requested.keys.findIndex((key) => {
    const item = foundItem(table, key, requested);

    if (item === undefined) {
      return budget.spent;
    }

    if (!budget.take(item.sizeInBytes())) {
      return true;
    }

    items.push(item.toAttributeValues());

    return false;
  });

  const read =
    unreadKeys === -1 ? requested.keys : requested.keys.slice(0, unreadKeys);
  const consistency = simDynamoDbReadConsistency(
    requested.request.ConsistentRead,
  );

  return {
    reference: requested.reference,
    items,
    readUnits: read.reduce(
      (units, key) =>
        units +
        simDynamoDbReadUnits(
          table.getItem(key)?.sizeInBytes() ?? 0,
          consistency,
        ),
      0,
    ),
    unprocessed:
      unreadKeys === -1
        ? undefined
        : {
            ...requested.request,
            Keys: (requested.request.Keys ?? []).slice(unreadKeys),
          },
  };
}

/**
 * Read one item, as the table it is in and the projection asked for it.
 */
function foundItem(
  table: SimDynamoDbTable,
  key: SimDynamoDbItem,
  requested: SimDynamoDbBatchTableReads,
): SimDynamoDbItem | undefined {
  const item = table.getItem(key);

  if (item === undefined) {
    return undefined;
  }

  return requested.projection?.apply(item) ?? item;
}
