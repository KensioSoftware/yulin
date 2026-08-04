import { SimCfnDynamoDbPropertyRules } from "../property/sim-cfn-dynamodb-property-rules.js";
import type { SimCfnDynamoDbPropertyValues } from "../property/sim-cfn-dynamodb-property-values.js";
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
 * stream its changes were meant to be published to would leave whatever reads
 * that stream waiting, so the Resource is skipped rather than deployed as
 * something else.
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
  readonly logicalId: string;
  readonly values: SimCfnDynamoDbPropertyValues;
}

/**
 * Which AWS::DynamoDB::Table properties simulated DynamoDB can act on.
 *
 * A real property that is not simulated skips the Resource, with a reason
 * naming it, so the rest of the stack still deploys and the report says what
 * was left out. Anything that is not an AWS::DynamoDB::Table property at all
 * fails the Resource instead, because that is a template real CloudFormation
 * would refuse too.
 *
 * The two index properties and the stream specification carry properties of
 * their own, which are held to the same rule a level down.
 */
export class SimCfnDynamoDbTablePropertyRules {
  private readonly logicalId: string;
  private readonly values: SimCfnDynamoDbPropertyValues;

  constructor(properties: SimCfnDynamoDbTablePropertyRulesProperties) {
    this.logicalId = properties.logicalId;
    this.values = properties.values;
  }

  /**
   * Refuse everything about this Resource that is not simulated.
   */
  assertSimulated(): void {
    new SimCfnDynamoDbPropertyRules({
      resourceTypeName: dynamoDbTableResourceTypeName,
      logicalId: this.logicalId,
      simulated: simulatedPropertyNames,
      unsimulated: unsimulatedPropertyNames,
    }).assertSimulated(this.values);

    this.assertSimulatedMembers();
  }

  /**
   * Refuse what the properties carrying properties of their own ask for and
   * cannot get: the two index lists, and the stream specification.
   */
  private assertSimulatedMembers(): void {
    const logicalId = this.logicalId;

    simCfnDynamoDbTableGlobalIndexRules(logicalId).assertEachSimulated(
      this.values.list("GlobalSecondaryIndexes"),
    );
    simCfnDynamoDbTableLocalIndexRules(logicalId).assertEachSimulated(
      this.values.list("LocalSecondaryIndexes"),
    );
    simCfnDynamoDbTableStreamRules(logicalId).assertSimulated(
      this.values.object("StreamSpecification"),
    );
  }
}
