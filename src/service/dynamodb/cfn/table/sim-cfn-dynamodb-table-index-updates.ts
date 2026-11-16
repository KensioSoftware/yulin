import type {
  SimDynamoDbGlobalSecondaryIndexUpdateInput,
  SimDynamoDbSecondaryIndexInput,
} from "../../command/table/table.types.js";
import { readSimDynamoDbIndexName } from "../../secondary-index/sim-dynamodb-index-name.js";
import { simCfnDynamoDbTableValueDiffers as differs } from "./sim-cfn-dynamodb-table-change.js";
import type { SimCfnDynamoDbTableProperties } from "./sim-cfn-dynamodb-table-properties.js";

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

/**
 * The capacity changes one definition of a table makes to the global secondary
 * indexes it keeps, as UpdateTable `Update` entries.
 *
 * An index whose capacity the template changed is sent. So is every index
 * kept through a switch to provisioned billing, since DynamoDB needs the
 * capacity of each one for that. A switch to on-demand takes the capacity of
 * every index away without being asked.
 */
export function simCfnDynamoDbIndexCapacityUpdates(
  before: SimCfnDynamoDbTableProperties,
  after: SimCfnDynamoDbTableProperties,
): readonly SimDynamoDbGlobalSecondaryIndexUpdateInput[] {
  if (!provisioned(after)) {
    return [];
  }

  const switched = !provisioned(before);
  const previous = new Map(
    before
      .globalSecondaryIndexes()
      .map((index) => [index.IndexName, index.ProvisionedThroughput]),
  );

  return after
    .globalSecondaryIndexes()
    .filter(
      ({ IndexName, ProvisionedThroughput }) =>
        previous.has(IndexName) &&
        (switched || differs(previous.get(IndexName), ProvisionedThroughput)),
    )
    .map(({ IndexName, ProvisionedThroughput }) => ({
      Update: { IndexName, ProvisionedThroughput },
    }));
}

/**
 * Whether a definition bills the table by provisioned capacity, which is what
 * CloudFormation creates a table with when the template names no mode.
 */
function provisioned(properties: SimCfnDynamoDbTableProperties): boolean {
  return (properties.billingMode() ?? "PROVISIONED") === "PROVISIONED";
}
