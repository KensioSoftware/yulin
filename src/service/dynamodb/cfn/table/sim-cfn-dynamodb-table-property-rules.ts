import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";

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
  "KeySchema",
  "ProvisionedThroughput",
  "TableClass",
  "TableName",
]);

/**
 * Real AWS::DynamoDB::Table properties this simulation does not model.
 *
 * Each one changes what the table does. A table deployed without its secondary
 * indexes would answer queries differently, and one deployed without its time
 * to live would hold items that should have expired, so the Resource is
 * skipped rather than deployed as something else.
 */
const unsimulatedPropertyNames: ReadonlySet<string> = new Set([
  "ContributorInsightsSpecification",
  "GlobalSecondaryIndexes",
  "ImportSourceSpecification",
  "KinesisStreamSpecification",
  "LocalSecondaryIndexes",
  "OnDemandThroughput",
  "PointInTimeRecoverySpecification",
  "ResourcePolicy",
  "SSESpecification",
  "StreamSpecification",
  "Tags",
  "TimeToLiveSpecification",
  "WarmThroughput",
]);

/**
 * Build the error a property of an AWS::DynamoDB::Table Resource is refused
 * with.
 *
 * The wording matters. Sim CloudFormation skips a Resource whose error reads as
 * an unsupported Resource type, and skipping is the wrong answer for a table
 * the template described in a way it cannot be created: nothing is missing from
 * the simulation, the template is wrong, and the same template would fail on
 * real CloudFormation.
 */
export function dynamoDbTablePropertyError(
  logicalId: string,
  reason: string,
): Error {
  return new Error(
    `Invalid AWS::DynamoDB::Table Resource ${logicalId}: ${reason}`,
  );
}

interface SimCfnDynamoDbTablePropertyRulesProperties {
  readonly logicalId: string;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * Which AWS::DynamoDB::Table properties simulated DynamoDB can act on.
 *
 * A real property that is not simulated skips the Resource, with a reason
 * naming it, so the rest of the stack still deploys and the report says what
 * was left out. Anything that is not an AWS::DynamoDB::Table property at all
 * fails the Resource instead, because that is a template real CloudFormation
 * would refuse too.
 */
export class SimCfnDynamoDbTablePropertyRules {
  private readonly logicalId: string;
  private readonly properties: SimCfnTemplateValueRecord;

  constructor(properties: SimCfnDynamoDbTablePropertyRulesProperties) {
    this.logicalId = properties.logicalId;
    this.properties = properties.properties;
  }

  /**
   * Refuse everything about this Resource that is not simulated.
   */
  assertSimulated(): void {
    for (const name of Object.keys(this.properties)) {
      this.assertSimulatedProperty(name);
    }
  }

  private assertSimulatedProperty(name: string): void {
    if (simulatedPropertyNames.has(name)) {
      return;
    }

    if (unsimulatedPropertyNames.has(name)) {
      throw this.skipError(name);
    }

    throw dynamoDbTablePropertyError(
      this.logicalId,
      `${name} is not an AWS::DynamoDB::Table property`,
    );
  }

  /**
   * The error that skips this Resource over a property that is not simulated.
   *
   * The "Unsupported sim ... CloudFormation" wording is what marks the Resource
   * as skipped rather than failing the stack, so the rest of the template still
   * deploys and the skip reason names the property.
   */
  private skipError(name: string): Error {
    return new Error(
      `Unsupported sim DynamoDB CloudFormation Resource ${this.logicalId}: ` +
        `${name} is a real AWS::DynamoDB::Table property that simulated ` +
        `DynamoDB does not simulate, so the table is skipped rather than ` +
        `created without it`,
    );
  }
}
