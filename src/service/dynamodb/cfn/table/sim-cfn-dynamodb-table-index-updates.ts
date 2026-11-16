import type {
  SimDynamoDbGlobalSecondaryIndexUpdateInput,
  SimDynamoDbSecondaryIndexInput,
} from "../../command/table/table.types.js";
import { readSimDynamoDbIndexName } from "../../secondary-index/sim-dynamodb-index-name.js";

/**
 * The global secondary indexes one definition of a table adds and drops
 * against another, as UpdateTable requests.
 */
export function simCfnDynamoDbIndexUpdates(
  current: readonly SimDynamoDbSecondaryIndexInput[],
  updated: readonly SimDynamoDbSecondaryIndexInput[],
): readonly SimDynamoDbGlobalSecondaryIndexUpdateInput[] {
  const currentNames = new Set(
    current.map((index) => readSimDynamoDbIndexName(index.IndexName)),
  );
  const updatedNames = new Set(
    updated.map((index) => readSimDynamoDbIndexName(index.IndexName)),
  );

  return [
    ...updated
      .filter(
        (index) => !currentNames.has(readSimDynamoDbIndexName(index.IndexName)),
      )
      .map((index) => ({ Create: index })),
    ...current
      .filter(
        (index) => !updatedNames.has(readSimDynamoDbIndexName(index.IndexName)),
      )
      .map((index) => ({ Delete: { IndexName: index.IndexName } })),
  ];
}
