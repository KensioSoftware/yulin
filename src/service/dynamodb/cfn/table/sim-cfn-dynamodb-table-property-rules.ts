import { SimCfnDynamoDbPropertyRules } from "../property/sim-cfn-dynamodb-property-rules.js";
import type { SimCfnDynamoDbPropertyValues } from "../property/sim-cfn-dynamodb-property-values.js";
import type { SimCfnDynamoDbResourceScope } from "../property/sim-cfn-dynamodb-resource-scope.js";
import { dynamoDbTableResourceTypeName } from "../sim-cfn-dynamodb-resource-type.js";
import {
  simCfnDynamoDbTableGlobalIndexRules,
  simCfnDynamoDbTableLocalIndexRules,
} from "./sim-cfn-dynamodb-table-index-rules.js";
import { simCfnDynamoDbTableStreamRules } from "./sim-cfn-dynamodb-table-stream-rules.js";

/**
 * The AWS::DynamoDB::Table properties this simulation acts on.
 *
 * Each one is handed to CreateTable rather than applied here, so what a value
 * is allowed to be stays in one place: the rules simulated DynamoDB already
 * applies to a CreateTable request.
 */
const simulatedPropertyNames: ReadonlySet<string> = new Set([
  "AttributeDefinitions",
  "BillingMode",
  "DeletionProtectionEnabled",
  "GlobalSecondaryIndexes",
  "KeySchema",
  "LocalSecondaryIndexes",
  "ProvisionedThroughput",
  "StreamSpecification",
  "TableClass",
  "TableName",
  "Tags",
  "TimeToLiveSpecification",
]);

/**
 * Real AWS::DynamoDB::Table properties this simulation does not model.
 *
 * Each one changes what the table does. A table deployed without the Kinesis
 * stream its changes were meant to be published to leaves whatever reads that
 * stream waiting, so the table is created without the property and the
 * omission is recorded where a test can find it.
 */
const unsimulatedPropertyNames: ReadonlySet<string> = new Set([
  "ContributorInsightsSpecification",
  "ImportSourceSpecification",
  "KinesisStreamSpecification",
  "OnDemandThroughput",
  "PointInTimeRecoverySpecification",
  "ResourcePolicy",
  "SSESpecification",
  "WarmThroughput",
]);

interface SimCfnDynamoDbTablePropertyRulesProperties {
  readonly scope: SimCfnDynamoDbResourceScope;
  readonly values: SimCfnDynamoDbPropertyValues;
}

/**
 * What simulated DynamoDB does with each AWS::DynamoDB::Table property.
 *
 * A property this simulation cannot act on is recorded against the Resource
 * and the table is created without it, rather than the table going missing
 * from the stack over one setting. Anything that is not an
 * AWS::DynamoDB::Table property at all is recorded the same way.
 *
 * The two index properties and the stream specification carry properties of
 * their own, which are held to the same rule a level down.
 */
export class SimCfnDynamoDbTablePropertyRules {
  private readonly scope: SimCfnDynamoDbResourceScope;
  private readonly values: SimCfnDynamoDbPropertyValues;

  constructor(properties: SimCfnDynamoDbTablePropertyRulesProperties) {
    this.scope = properties.scope;
    this.values = properties.values;
  }

  /**
   * Record everything about this Resource the table is created without.
   */
  apply(): void {
    new SimCfnDynamoDbPropertyRules({
      resourceTypeName: dynamoDbTableResourceTypeName,
      scope: this.scope,
      simulated: simulatedPropertyNames,
      unsimulated: unsimulatedPropertyNames,
    }).apply(this.values);

    this.applyToMembers();
  }

  /**
   * Apply the same rule to the properties carrying properties of their own:
   * the two index lists, and the stream specification.
   */
  private applyToMembers(): void {
    const scope = this.scope;

    simCfnDynamoDbTableGlobalIndexRules(scope).applyToEach(
      this.values.list("GlobalSecondaryIndexes"),
    );
    simCfnDynamoDbTableLocalIndexRules(scope).applyToEach(
      this.values.list("LocalSecondaryIndexes"),
    );
    simCfnDynamoDbTableStreamRules(scope).apply(
      this.values.object("StreamSpecification"),
    );
  }
}
