import { SimDynamoDbGlobalSecondaryIndex } from "../secondary-index/sim-dynamodb-global-secondary-index.js";
import { assertSimDynamoDbIndexAddable } from "../secondary-index/sim-dynamodb-index-limits.js";
import { readSimDynamoDbIndexThroughput } from "../secondary-index/sim-dynamodb-index-throughput.js";
import type { SimDynamoDbAttributeDefinitions } from "./sim-dynamodb-attribute-definitions.js";
import type { SimDynamoDbIndexUpdate } from "./sim-dynamodb-index-update.js";
import type { SimDynamoDbTableBilling } from "./sim-dynamodb-table-billing.js";
import type { SimDynamoDbTableThroughput } from "./sim-dynamodb-table-throughput.js";
import type { SimDynamoDbUpdatableTable } from "./sim-dynamodb-updatable-table.js";

/**
 * Build the index an UpdateTable adds, checked against the table it goes onto.
 *
 * The definitions are the merged ones rather than the table's, since the key
 * attributes of a new index are declared on the same call that adds it.
 */
export function simDynamoDbCreatedIndex(
  indexUpdate: SimDynamoDbIndexUpdate,
  table: SimDynamoDbUpdatableTable,
  attributeDefinitions: SimDynamoDbAttributeDefinitions,
): SimDynamoDbGlobalSecondaryIndex | undefined {
  if (indexUpdate.created === undefined) {
    return undefined;
  }

  const index = SimDynamoDbGlobalSecondaryIndex.added(indexUpdate.created, {
    tableArn: table.arn,
    keySchema: table.keySchema,
    billing: table.billing,
  });

  attributeDefinitions.assertDefines(index.keySchema);
  assertSimDynamoDbIndexAddable(table.indexes.elements, index);

  return index;
}

/**
 * The name of the index an UpdateTable removes, refusing one the table lacks.
 */
export function simDynamoDbDeletedIndexName(
  indexUpdate: SimDynamoDbIndexUpdate,
  table: SimDynamoDbUpdatableTable,
): string | undefined {
  if (indexUpdate.deletedName === undefined) {
    return undefined;
  }

  return table.indexes.global.required(indexUpdate.deletedName, table.tableName)
    .name;
}

/**
 * The capacity each global secondary index has once an UpdateTable applies.
 *
 * An `Update` entry is read under the billing the table will have, so capacity
 * for an on-demand table is refused. A change of billing mode reaches every
 * index. A switch to on-demand takes their capacity away, and a switch to
 * provisioned needs an `Update` naming the capacity of each one. That is the
 * same stance the table's own capacity takes. Real DynamoDB would estimate it
 * from consumption this simulation does not measure.
 */
export function simDynamoDbIndexThroughputs(
  indexUpdate: SimDynamoDbIndexUpdate,
  table: SimDynamoDbUpdatableTable,
  billing: SimDynamoDbTableBilling | undefined,
): ReadonlyMap<string, SimDynamoDbTableThroughput> {
  const billedAs = billing ?? table.billing;
  const throughputs = new Map(
    indexUpdate.updated.map(({ indexName, input }) => [
      table.indexes.global.required(indexName, table.tableName).name,
      readSimDynamoDbIndexThroughput(input, indexName, billedAs),
    ]),
  );

  if (billedAs.mode === table.billing.mode) {
    return throughputs;
  }

  for (const { name } of table.indexes.global.elements) {
    if (!throughputs.has(name)) {
      throughputs.set(name, readSimDynamoDbIndexThroughput({}, name, billedAs));
    }
  }

  return throughputs;
}
