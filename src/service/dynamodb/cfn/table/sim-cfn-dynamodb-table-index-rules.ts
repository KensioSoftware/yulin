import { SimCfnDynamoDbPropertyRules } from "../property/sim-cfn-dynamodb-property-rules.js";
import type { SimCfnDynamoDbResourceScope } from "../property/sim-cfn-dynamodb-resource-scope.js";
import { dynamoDbTableResourceTypeName } from "../sim-cfn-dynamodb-resource-type.js";

/**
 * The GlobalSecondaryIndex properties this simulation acts on.
 *
 * Each one is handed to CreateTable rather than applied here, so what an index
 * name, a key schema, a projection or a capacity is allowed to be stays with
 * the rules simulated DynamoDB already applies to a CreateTable request.
 */
const simulatedGlobalIndexPropertyNames: ReadonlySet<string> = new Set([
  "IndexName",
  "KeySchema",
  "Projection",
  "ProvisionedThroughput",
]);

/**
 * Real GlobalSecondaryIndex properties this simulation does not model.
 */
const unsimulatedGlobalIndexPropertyNames: ReadonlySet<string> = new Set([
  "ContributorInsightsSpecification",
  "OnDemandThroughput",
  "WarmThroughput",
]);

/**
 * The LocalSecondaryIndex properties, which this simulation models all of.
 *
 * A local secondary index is built with its table and reads out of the table's
 * capacity, so AWS gives it no throughput or insights settings of its own.
 * There is nothing here that is real and unmodelled, which is why there is no
 * unsimulated set to go with this one.
 */
const simulatedLocalIndexPropertyNames: ReadonlySet<string> = new Set([
  "IndexName",
  "KeySchema",
  "Projection",
]);

/**
 * The rules a `GlobalSecondaryIndexes` entry is read under.
 *
 * This is the table's own property rule applied a level down. A real index
 * property that is not simulated is recorded and the index is created without
 * it, since a table deployed without a setting its index asked for answers reads
 * differently.
 */
export function simCfnDynamoDbTableGlobalIndexRules(
  scope: SimCfnDynamoDbResourceScope,
): SimCfnDynamoDbPropertyRules {
  return new SimCfnDynamoDbPropertyRules({
    resourceTypeName: dynamoDbTableResourceTypeName,
    scope,
    kind: "GlobalSecondaryIndex",
    simulated: simulatedGlobalIndexPropertyNames,
    unsimulated: unsimulatedGlobalIndexPropertyNames,
  });
}

/**
 * The rules a `LocalSecondaryIndexes` entry is read under.
 */
export function simCfnDynamoDbTableLocalIndexRules(
  scope: SimCfnDynamoDbResourceScope,
): SimCfnDynamoDbPropertyRules {
  return new SimCfnDynamoDbPropertyRules({
    resourceTypeName: dynamoDbTableResourceTypeName,
    scope,
    kind: "LocalSecondaryIndex",
    simulated: simulatedLocalIndexPropertyNames,
  });
}
