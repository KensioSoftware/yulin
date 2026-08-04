import type { SimCfnDynamoDbPropertyValues } from "../property/sim-cfn-dynamodb-property-values.js";
import {
  simCfnDynamoDbGlobalTableIndexRules,
  simCfnDynamoDbGlobalTableLocalIndexRules,
  simCfnDynamoDbGlobalTableRules,
  simCfnDynamoDbGlobalTableStreamRules,
  simCfnDynamoDbGlobalTableWriteCapacityRules,
} from "./sim-cfn-dynamodb-global-table-property-rules.js";
import {
  simCfnDynamoDbGlobalTableReadCapacityRules,
  simCfnDynamoDbGlobalTableReplicaIndexRules,
  simCfnDynamoDbGlobalTableReplicaRules,
} from "./sim-cfn-dynamodb-global-table-replica-rules.js";

interface SimCfnDynamoDbGlobalTableSimulatedProperties {
  readonly logicalId: string;
  readonly values: SimCfnDynamoDbPropertyValues;
  readonly replica: SimCfnDynamoDbPropertyValues;
}

/**
 * Refuse everything an AWS::DynamoDB::GlobalTable asks for and cannot get, at
 * every level a global table nests: the table, its indexes, its stream, the
 * replica, the replica's per-index settings, and the two halves of its
 * capacity.
 *
 * Each level is a set of property names rather than a rule of its own, so what
 * differs between them is which names belong where.
 */
export function assertSimCfnDynamoDbGlobalTableSimulated(
  properties: SimCfnDynamoDbGlobalTableSimulatedProperties,
): void {
  const { logicalId, values, replica } = properties;
  const indexes = values.list("GlobalSecondaryIndexes");
  const replicaIndexes = replica.list("GlobalSecondaryIndexes");

  simCfnDynamoDbGlobalTableRules(logicalId).assertSimulated(values);
  simCfnDynamoDbGlobalTableIndexRules(logicalId).assertEachSimulated(indexes);
  simCfnDynamoDbGlobalTableLocalIndexRules(logicalId).assertEachSimulated(
    values.list("LocalSecondaryIndexes"),
  );
  simCfnDynamoDbGlobalTableStreamRules(logicalId).assertSimulated(
    values.object("StreamSpecification"),
  );
  simCfnDynamoDbGlobalTableReplicaRules(logicalId).assertSimulated(replica);
  simCfnDynamoDbGlobalTableReplicaIndexRules(logicalId).assertEachSimulated(
    replicaIndexes,
  );

  assertSimulatedCapacity(
    logicalId,
    [values, ...indexes],
    [replica, ...replicaIndexes],
  );
}

/**
 * Refuse a capacity that changes with load, wherever it was asked for.
 *
 * The table and each of its indexes state the writing half, and the replica and
 * its per-index entries state the reading half, so both sets are held to the
 * same rule.
 */
function assertSimulatedCapacity(
  logicalId: string,
  writing: readonly SimCfnDynamoDbPropertyValues[],
  reading: readonly SimCfnDynamoDbPropertyValues[],
): void {
  const writeRules = simCfnDynamoDbGlobalTableWriteCapacityRules(logicalId);
  const readRules = simCfnDynamoDbGlobalTableReadCapacityRules(logicalId);

  for (const values of writing) {
    writeRules.assertSimulated(
      values.object("WriteProvisionedThroughputSettings"),
    );
  }

  for (const values of reading) {
    readRules.assertSimulated(
      values.object("ReadProvisionedThroughputSettings"),
    );
  }
}
