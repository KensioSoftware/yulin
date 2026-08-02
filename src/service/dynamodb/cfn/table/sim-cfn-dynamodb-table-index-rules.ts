import {
  dynamoDbTablePropertyError,
  dynamoDbTableUnsimulatedPropertyError,
} from "./sim-cfn-dynamodb-table-property-error.js";
import type { SimCfnDynamoDbTableValues } from "./sim-cfn-dynamodb-table-values.js";

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

interface SimCfnDynamoDbTableIndexRulesProperties {
  readonly logicalId: string;
  readonly kind: string;
  readonly simulated: ReadonlySet<string>;
  readonly unsimulated: ReadonlySet<string>;
}

/**
 * Which properties of one secondary index a template declares simulated
 * DynamoDB can act on.
 *
 * This is the table's own property rule applied a level down. A real index
 * property that is not simulated skips the whole table, since a table deployed
 * without a setting its index asked for answers reads differently. Anything
 * that is not an index property at all fails the Resource, because that is a
 * template real CloudFormation would refuse too.
 */
export class SimCfnDynamoDbTableIndexRules {
  private readonly logicalId: string;
  private readonly kind: string;
  private readonly simulated: ReadonlySet<string>;
  private readonly unsimulated: ReadonlySet<string>;

  private constructor(properties: SimCfnDynamoDbTableIndexRulesProperties) {
    this.logicalId = properties.logicalId;
    this.kind = properties.kind;
    this.simulated = properties.simulated;
    this.unsimulated = properties.unsimulated;
  }

  /**
   * The rules a `GlobalSecondaryIndexes` entry is read under.
   */
  static global(logicalId: string): SimCfnDynamoDbTableIndexRules {
    return new this({
      logicalId,
      kind: "GlobalSecondaryIndex",
      simulated: simulatedGlobalIndexPropertyNames,
      unsimulated: unsimulatedGlobalIndexPropertyNames,
    });
  }

  /**
   * The rules a `LocalSecondaryIndexes` entry is read under.
   */
  static local(logicalId: string): SimCfnDynamoDbTableIndexRules {
    return new this({
      logicalId,
      kind: "LocalSecondaryIndex",
      simulated: simulatedLocalIndexPropertyNames,
      unsimulated: new Set<string>(),
    });
  }

  /**
   * Refuse everything about these index entries that is not simulated.
   */
  assertSimulated(entries: readonly SimCfnDynamoDbTableValues[]): void {
    for (const entry of entries) {
      for (const name of entry.names) {
        this.assertSimulatedProperty(entry, name);
      }
    }
  }

  private assertSimulatedProperty(
    entry: SimCfnDynamoDbTableValues,
    name: string,
  ): void {
    if (this.simulated.has(name)) {
      return;
    }

    if (this.unsimulated.has(name)) {
      throw dynamoDbTableUnsimulatedPropertyError(
        this.logicalId,
        entry.pathTo(name),
      );
    }

    throw dynamoDbTablePropertyError(
      this.logicalId,
      `${entry.pathTo(name)} is not an AWS::DynamoDB::Table ${this.kind} ` +
        `property`,
    );
  }
}
