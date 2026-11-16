import type { SimDynamoDbTable } from "../table/sim-dynamodb-table.js";
import {
  simDynamoDbItemCollectionSize,
  type SimDynamoDbItemCollectionSize,
} from "./sim-dynamodb-item-collection-metrics.js";
import { assertSimDynamoDbEnumValue } from "./sim-dynamodb-return-consumed-capacity.js";
import type { SimDynamoDbItemWrite } from "./sim-dynamodb-write-capacity.js";

const metricsLevels = ["SIZE", "NONE"] as const;

/**
 * Whether a write asked for `ReturnItemCollectionMetrics`, refusing a value
 * AWS refuses.
 */
export function readSimDynamoDbReturnItemCollectionMetrics(
  level = "NONE",
): boolean {
  assertSimDynamoDbEnumValue(
    level,
    metricsLevels,
    "returnItemCollectionMetrics",
  );

  return level === "SIZE";
}

/**
 * The size of the item collection one write left, when the request asked for
 * it and the write left an item to measure by.
 */
export function simDynamoDbWrittenCollectionSize(
  asked: boolean,
  table: SimDynamoDbTable,
  write: SimDynamoDbItemWrite,
): SimDynamoDbItemCollectionSize | undefined {
  const written = write.after ?? write.before;

  if (!asked || written === undefined) {
    return undefined;
  }

  return simDynamoDbItemCollectionSize(table, written);
}
