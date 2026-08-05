import type { SimCfnDynamoDbPropertyValues } from "../property/sim-cfn-dynamodb-property-values.js";
import type { SimCfnDynamoDbResourceScope } from "../property/sim-cfn-dynamodb-resource-scope.js";
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
  readonly scope: SimCfnDynamoDbResourceScope;
  readonly values: SimCfnDynamoDbPropertyValues;
  readonly replica: SimCfnDynamoDbPropertyValues;
}

/**
 * Record everything an AWS::DynamoDB::GlobalTable asks for and cannot get, at
 * every level a global table nests: the table, its indexes, its stream, the
 * replica, the replica's per-index settings, and the two halves of its
 * capacity.
 *
 * Each level is a set of property names rather than a rule of its own, so what
 * differs between them is which names belong where. The table is created
 * either way; the record is what says which of those levels was read past.
 */
export function applySimCfnDynamoDbGlobalTableRules(
  properties: SimCfnDynamoDbGlobalTableSimulatedProperties,
): void {
  const { scope, values, replica } = properties;
  const indexes = values.list("GlobalSecondaryIndexes");
  const replicaIndexes = replica.list("GlobalSecondaryIndexes");

  simCfnDynamoDbGlobalTableRules(scope).apply(values);
  simCfnDynamoDbGlobalTableIndexRules(scope).applyToEach(indexes);
  simCfnDynamoDbGlobalTableLocalIndexRules(scope).applyToEach(
    values.list("LocalSecondaryIndexes"),
  );
  simCfnDynamoDbGlobalTableStreamRules(scope).apply(
    values.object("StreamSpecification"),
  );
  simCfnDynamoDbGlobalTableReplicaRules(scope).apply(replica);
  simCfnDynamoDbGlobalTableReplicaIndexRules(scope).applyToEach(replicaIndexes);

  applyCapacityRules(scope, [values, ...indexes], [replica, ...replicaIndexes]);
}

/**
 * Record a capacity that changes with load, wherever it was asked for.
 *
 * The table and each of its indexes state the writing half, and the replica and
 * its per-index entries state the reading half, so both sets are held to the
 * same rule.
 */
function applyCapacityRules(
  scope: SimCfnDynamoDbResourceScope,
  writing: readonly SimCfnDynamoDbPropertyValues[],
  reading: readonly SimCfnDynamoDbPropertyValues[],
): void {
  const writeRules = simCfnDynamoDbGlobalTableWriteCapacityRules(scope);
  const readRules = simCfnDynamoDbGlobalTableReadCapacityRules(scope);

  for (const values of writing) {
    writeRules.apply(values.object("WriteProvisionedThroughputSettings"));
  }

  for (const values of reading) {
    readRules.apply(values.object("ReadProvisionedThroughputSettings"));
  }
}
