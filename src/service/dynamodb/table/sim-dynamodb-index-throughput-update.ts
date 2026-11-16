import type {
  SimDynamoDbGlobalSecondaryIndexUpdateInput,
  SimDynamoDbSecondaryIndexInput,
} from "../command/table/table.types.js";
import {
  SimDynamoDbUnsupportedOperation,
  SimDynamoDbValidationException,
} from "../error/dynamodb.error.js";
import { readSimDynamoDbIndexName } from "../secondary-index/sim-dynamodb-index-name.js";

/**
 * One `Update` entry: the index it names, and the capacity it asks for.
 */
export interface SimDynamoDbIndexThroughputUpdate {
  readonly indexName: string;
  readonly input: SimDynamoDbSecondaryIndexInput;
}

/**
 * Refuse the capacity settings an `Update` entry carries beyond provisioned
 * capacity, the same way CreateTable refuses them on an index.
 */
function refuseUnsimulatedIndexThroughput(
  entry: SimDynamoDbGlobalSecondaryIndexUpdateInput,
): void {
  if (entry.Update?.OnDemandThroughput !== undefined) {
    throw new SimDynamoDbUnsupportedOperation(
      "OnDemandThroughput maximums are not simulated, so UpdateTable refuses " +
        "them on an index rather than reporting limits nothing here applies",
    );
  }

  if (entry.Update?.WarmThroughput !== undefined) {
    throw new SimDynamoDbUnsupportedOperation(
      "WarmThroughput is not simulated, so UpdateTable refuses it on an index " +
        "rather than reporting a pre-warmed capacity nothing here applies",
    );
  }
}

/**
 * Read the `Update` entries a `GlobalSecondaryIndexUpdates` carries, each
 * naming one index once.
 */
export function readSimDynamoDbIndexThroughputUpdates(
  entries: readonly SimDynamoDbGlobalSecondaryIndexUpdateInput[],
): readonly SimDynamoDbIndexThroughputUpdate[] {
  for (const entry of entries) {
    refuseUnsimulatedIndexThroughput(entry);
  }

  const updates = entries
    .map((entry) => entry.Update)
    .filter((update) => update !== undefined)
    .map((update) => ({
      indexName: readSimDynamoDbIndexName(update.IndexName),
      input: update,
    }));
  const names = new Set(updates.map(({ indexName }) => indexName));

  if (names.size < updates.length) {
    throw new SimDynamoDbValidationException(
      "One or more parameter values were invalid: a " +
        "GlobalSecondaryIndexUpdates request names the same index in more " +
        "than one Update",
    );
  }

  return updates;
}
