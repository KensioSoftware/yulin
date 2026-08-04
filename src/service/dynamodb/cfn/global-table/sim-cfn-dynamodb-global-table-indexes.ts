import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCfnDynamoDbPropertyValues } from "../property/sim-cfn-dynamodb-property-values.js";
import { simCfnDynamoDbGlobalTableCapacity } from "./sim-cfn-dynamodb-global-table-capacity.js";
import {
  type SimCfnDynamoDbGlobalTableEntry,
  simCfnDynamoDbGlobalTableEntry,
  simCfnDynamoDbGlobalTableProperty,
} from "./sim-cfn-dynamodb-global-table-property.js";

/**
 * The `GlobalSecondaryIndexes` an AWS::DynamoDB::Table would carry, built from
 * the two halves a global table splits each index into.
 *
 * The table names the index and what it projects, and provisions its writes.
 * The replica provisions its reads, naming the index it is talking about rather
 * than restating it. Putting them back together is what makes an index on a
 * global table the index an ordinary table's template would have declared.
 *
 * A table declaring the property at all keeps it, even holding no indexes, so
 * an empty list stays an empty list rather than becoming a table that never
 * mentioned indexes.
 */
export function simCfnDynamoDbGlobalTableIndexes(
  values: SimCfnDynamoDbPropertyValues,
  replica: SimCfnDynamoDbPropertyValues,
): SimCfnTemplateValue | undefined {
  if (values.value("GlobalSecondaryIndexes") === undefined) {
    return undefined;
  }

  const readSettings = replicaReadSettings(replica);

  return values.list("GlobalSecondaryIndexes").map((index) => {
    const indexName = index.string("IndexName");

    return tableIndex(
      index,
      indexName === undefined ? undefined : readSettings.get(indexName),
    );
  });
}

/**
 * One index, as the table declared it and the replica provisioned it.
 */
function tableIndex(
  index: SimCfnDynamoDbPropertyValues,
  replicaIndex: SimCfnDynamoDbPropertyValues | undefined,
): SimCfnTemplateValueRecord {
  return Object.fromEntries([
    ...simCfnDynamoDbGlobalTableProperty(index, [
      "IndexName",
      "KeySchema",
      "Projection",
    ]),
    ...namedCapacity(index, replicaIndex),
  ]);
}

/**
 * The `ProvisionedThroughput` entry an index gets, where either half of its
 * capacity was stated.
 */
function namedCapacity(
  index: SimCfnDynamoDbPropertyValues,
  replicaIndex: SimCfnDynamoDbPropertyValues | undefined,
): readonly SimCfnDynamoDbGlobalTableEntry[] {
  return simCfnDynamoDbGlobalTableEntry(
    "ProvisionedThroughput",
    simCfnDynamoDbGlobalTableCapacity({
      read: replicaIndex?.object("ReadProvisionedThroughputSettings"),
      write: index.object("WriteProvisionedThroughputSettings"),
    }),
  );
}

/**
 * The replica's per-index read settings, by the index they name.
 *
 * An entry naming no index is left out rather than matched to something, since
 * there is nothing it could be about. CreateTable is where an index with no
 * name is refused.
 */
function replicaReadSettings(
  replica: SimCfnDynamoDbPropertyValues,
): ReadonlyMap<string, SimCfnDynamoDbPropertyValues> {
  return new Map(
    replica.list("GlobalSecondaryIndexes").flatMap((index) => {
      const indexName = index.string("IndexName");

      return indexName === undefined ? [] : [[indexName, index] as const];
    }),
  );
}
