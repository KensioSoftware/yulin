import { SimCfnDynamoDbPropertyRules } from "../property/sim-cfn-dynamodb-property-rules.js";
import type { SimCfnDynamoDbResourceScope } from "../property/sim-cfn-dynamodb-resource-scope.js";
import { dynamoDbGlobalTableResourceTypeName } from "../sim-cfn-dynamodb-resource-type.js";

/**
 * The replica properties this simulation acts on.
 *
 * A replica is where a global table says the things an ordinary table says
 * about itself: what it is protected from, what class it is stored in, what it
 * is tagged with, and what it is provisioned to read.
 */
const simulatedReplicaPropertyNames: ReadonlySet<string> = new Set([
  "DeletionProtectionEnabled",
  "GlobalSecondaryIndexes",
  "ReadProvisionedThroughputSettings",
  "Region",
  "TableClass",
  "Tags",
]);

/**
 * Real replica properties this simulation does not model.
 *
 * These are the same settings the AWS::DynamoDB::Table path skips, in the place
 * a global table puts them, so a template asking for point in time recovery is
 * skipped whichever Resource type it asked through.
 */
const unsimulatedReplicaPropertyNames: ReadonlySet<string> = new Set([
  "ContributorInsightsSpecification",
  "KinesisStreamSpecification",
  "PointInTimeRecoverySpecification",
  "ReadOnDemandThroughputSettings",
  "ResourcePolicy",
  "SSESpecification",
]);

/**
 * The per-replica global secondary index properties this simulation acts on.
 *
 * A replica does not restate what an index is, only what it is provisioned to
 * read, so the entry names the index and its read capacity and nothing else.
 */
const simulatedReplicaIndexPropertyNames: ReadonlySet<string> = new Set([
  "IndexName",
  "ReadProvisionedThroughputSettings",
]);

const unsimulatedReplicaIndexPropertyNames: ReadonlySet<string> = new Set([
  "ContributorInsightsSpecification",
  "ReadOnDemandThroughputSettings",
]);

/**
 * The read capacity settings this simulation acts on.
 *
 * A fixed `ReadCapacityUnits` is half of the capacity an ordinary table's
 * `ProvisionedThroughput` states. `ReadCapacityAutoScalingSettings` asks for
 * capacity that changes with load, which nothing here changes, so it is
 * recorded and the table is created at the `MinCapacity` it names.
 */
const simulatedReadCapacityPropertyNames: ReadonlySet<string> = new Set([
  "ReadCapacityUnits",
]);

const unsimulatedReadCapacityPropertyNames: ReadonlySet<string> = new Set([
  "ReadCapacityAutoScalingSettings",
]);

/**
 * The rules a `Replicas` entry is read under.
 */
export function simCfnDynamoDbGlobalTableReplicaRules(
  scope: SimCfnDynamoDbResourceScope,
): SimCfnDynamoDbPropertyRules {
  return new SimCfnDynamoDbPropertyRules({
    resourceTypeName: dynamoDbGlobalTableResourceTypeName,
    scope,
    kind: "Replica",
    simulated: simulatedReplicaPropertyNames,
    unsimulated: unsimulatedReplicaPropertyNames,
  });
}

/**
 * The rules a replica's `GlobalSecondaryIndexes` entry is read under.
 */
export function simCfnDynamoDbGlobalTableReplicaIndexRules(
  scope: SimCfnDynamoDbResourceScope,
): SimCfnDynamoDbPropertyRules {
  return new SimCfnDynamoDbPropertyRules({
    resourceTypeName: dynamoDbGlobalTableResourceTypeName,
    scope,
    kind: "Replica GlobalSecondaryIndex",
    simulated: simulatedReplicaIndexPropertyNames,
    unsimulated: unsimulatedReplicaIndexPropertyNames,
  });
}

/**
 * The rules a `ReadProvisionedThroughputSettings` is read under, on the replica
 * or on one of its global secondary indexes.
 */
export function simCfnDynamoDbGlobalTableReadCapacityRules(
  scope: SimCfnDynamoDbResourceScope,
): SimCfnDynamoDbPropertyRules {
  return new SimCfnDynamoDbPropertyRules({
    resourceTypeName: dynamoDbGlobalTableResourceTypeName,
    scope,
    kind: "ReadProvisionedThroughputSettings",
    simulated: simulatedReadCapacityPropertyNames,
    unsimulated: unsimulatedReadCapacityPropertyNames,
  });
}
