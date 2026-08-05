import { SimCfnDynamoDbPropertyRules } from "../property/sim-cfn-dynamodb-property-rules.js";
import type { SimCfnDynamoDbResourceScope } from "../property/sim-cfn-dynamodb-resource-scope.js";
import { dynamoDbGlobalTableResourceTypeName } from "../sim-cfn-dynamodb-resource-type.js";

/**
 * The AWS::DynamoDB::GlobalTable properties this simulation acts on.
 *
 * Everything but `Replicas` is the table itself, and is handed on to the
 * AWS::DynamoDB::Table path in the shape it already reads. `Replicas` is what
 * decides whether there is a table here to create at all.
 */
const simulatedPropertyNames: ReadonlySet<string> = new Set([
  "AttributeDefinitions",
  "BillingMode",
  "GlobalSecondaryIndexes",
  "KeySchema",
  "LocalSecondaryIndexes",
  "Replicas",
  "StreamSpecification",
  "TableName",
  "TimeToLiveSpecification",
  "WriteProvisionedThroughputSettings",
]);

/**
 * Real AWS::DynamoDB::GlobalTable properties this simulation does not model.
 *
 * These are the ones the AWS::DynamoDB::Table path already skips, under the
 * names a global table gives them, plus `MultiRegionConsistency`, which is a
 * statement about replication and so has nothing to be true of here.
 */
const unsimulatedPropertyNames: ReadonlySet<string> = new Set([
  "MultiRegionConsistency",
  "SSESpecification",
  "WarmThroughput",
  "WriteOnDemandThroughputSettings",
]);

/**
 * The GlobalSecondaryIndex properties a global table's own index carries.
 *
 * A global table splits an index's capacity in two: the write capacity is the
 * table's, since every replica takes the same writes, and the read capacity
 * belongs to each replica. This is the writing half.
 */
const simulatedIndexPropertyNames: ReadonlySet<string> = new Set([
  "IndexName",
  "KeySchema",
  "Projection",
  "WriteProvisionedThroughputSettings",
]);

/**
 * Real GlobalSecondaryIndex properties of a global table this simulation does
 * not model.
 */
const unsimulatedIndexPropertyNames: ReadonlySet<string> = new Set([
  "WarmThroughput",
  "WriteOnDemandThroughputSettings",
]);

/**
 * The LocalSecondaryIndex properties, which this simulation models all of.
 *
 * A local secondary index reads out of its table's capacity rather than having
 * any of its own, on a global table as on an ordinary one, so there is nothing
 * here that is real and unmodelled.
 */
const simulatedLocalIndexPropertyNames: ReadonlySet<string> = new Set([
  "IndexName",
  "KeySchema",
  "Projection",
]);

/**
 * The StreamSpecification properties of a global table.
 *
 * A global table's stream is what replication reads from, so AWS gives it no
 * `ResourcePolicy` and no choice of view type worth the name. `StreamViewType`
 * is the whole of it.
 */
const simulatedStreamPropertyNames: ReadonlySet<string> = new Set([
  "StreamViewType",
]);

/**
 * The write capacity settings this simulation acts on.
 *
 * A fixed `WriteCapacityUnits` is the capacity an ordinary table's
 * `ProvisionedThroughput` states, so it is carried across.
 * `WriteCapacityAutoScalingSettings` asks for capacity that changes with load,
 * which nothing here changes, so it is recorded and the table is created at the
 * `MinCapacity` it names.
 */
const simulatedWriteCapacityPropertyNames: ReadonlySet<string> = new Set([
  "WriteCapacityUnits",
]);

const unsimulatedWriteCapacityPropertyNames: ReadonlySet<string> = new Set([
  "WriteCapacityAutoScalingSettings",
]);

/**
 * The rules the Resource's own properties are read under.
 */
export function simCfnDynamoDbGlobalTableRules(
  scope: SimCfnDynamoDbResourceScope,
): SimCfnDynamoDbPropertyRules {
  return new SimCfnDynamoDbPropertyRules({
    resourceTypeName: dynamoDbGlobalTableResourceTypeName,
    scope,
    simulated: simulatedPropertyNames,
    unsimulated: unsimulatedPropertyNames,
  });
}

/**
 * The rules a `GlobalSecondaryIndexes` entry on the table itself is read under.
 */
export function simCfnDynamoDbGlobalTableIndexRules(
  scope: SimCfnDynamoDbResourceScope,
): SimCfnDynamoDbPropertyRules {
  return new SimCfnDynamoDbPropertyRules({
    resourceTypeName: dynamoDbGlobalTableResourceTypeName,
    scope,
    kind: "GlobalSecondaryIndex",
    simulated: simulatedIndexPropertyNames,
    unsimulated: unsimulatedIndexPropertyNames,
  });
}

/**
 * The rules a `LocalSecondaryIndexes` entry is read under.
 */
export function simCfnDynamoDbGlobalTableLocalIndexRules(
  scope: SimCfnDynamoDbResourceScope,
): SimCfnDynamoDbPropertyRules {
  return new SimCfnDynamoDbPropertyRules({
    resourceTypeName: dynamoDbGlobalTableResourceTypeName,
    scope,
    kind: "LocalSecondaryIndex",
    simulated: simulatedLocalIndexPropertyNames,
  });
}

/**
 * The rules the `StreamSpecification` is read under.
 */
export function simCfnDynamoDbGlobalTableStreamRules(
  scope: SimCfnDynamoDbResourceScope,
): SimCfnDynamoDbPropertyRules {
  return new SimCfnDynamoDbPropertyRules({
    resourceTypeName: dynamoDbGlobalTableResourceTypeName,
    scope,
    kind: "StreamSpecification",
    simulated: simulatedStreamPropertyNames,
  });
}

/**
 * The rules a `WriteProvisionedThroughputSettings` is read under, on the table
 * or on one of its global secondary indexes.
 */
export function simCfnDynamoDbGlobalTableWriteCapacityRules(
  scope: SimCfnDynamoDbResourceScope,
): SimCfnDynamoDbPropertyRules {
  return new SimCfnDynamoDbPropertyRules({
    resourceTypeName: dynamoDbGlobalTableResourceTypeName,
    scope,
    kind: "WriteProvisionedThroughputSettings",
    simulated: simulatedWriteCapacityPropertyNames,
    unsimulated: unsimulatedWriteCapacityPropertyNames,
  });
}
