import type { SimCfnDynamoDbPropertyValues } from "../property/sim-cfn-dynamodb-property-values.js";

interface SimCfnDynamoDbGlobalTableReplicasProperties {
  readonly logicalId: string;
  readonly regionName: string;
  readonly values: SimCfnDynamoDbPropertyValues;
}

/**
 * The one replica a global table this simulation can create is made of.
 *
 * A global table naming one replica is an ordinary table in that region,
 * because with one replica that is what it is. CDK's `TableV2` synthesises one
 * for every table it makes, since `renderReplicaTables` always appends the
 * stack's own region, so a table with no `replicas` prop at all arrives here.
 *
 * Two or more replicas is a table that replicates, which is not simulated. That
 * skips the Resource with a reason naming the regions, so the rest of the stack
 * still deploys and the report says which table was left out and why. The line
 * is drawn at the replica count rather than at the Resource type because that
 * is where the behaviour actually differs.
 */
export class SimCfnDynamoDbGlobalTableReplicas {
  private readonly logicalId: string;
  private readonly regionName: string;
  private readonly values: SimCfnDynamoDbPropertyValues;

  constructor(properties: SimCfnDynamoDbGlobalTableReplicasProperties) {
    this.logicalId = properties.logicalId;
    this.regionName = properties.regionName;
    this.values = properties.values;
  }

  /**
   * The single replica this global table is, refusing every other count.
   */
  single(): SimCfnDynamoDbPropertyValues {
    const replicas = this.values.list("Replicas");

    if (replicas.length > 1) {
      throw this.replicatedError(replicas);
    }

    const replica = replicas.at(0);

    if (replica === undefined) {
      throw this.values.error(
        "Replicas must name at least one region, since a global table with " +
          "no replica is a table in no region, and real CloudFormation " +
          "refuses that template too",
      );
    }

    this.assertOwnRegion(replica);

    return replica;
  }

  /**
   * Refuse a replica somewhere other than where the stack is deploying.
   *
   * The Resource is created in the Account and Region the stack deploys into,
   * which is the only place a simulated table can appear. Real CloudFormation
   * requires the replica list to include the stack's own region, so a template
   * naming one region and deploying into another is one it refuses as well.
   */
  private assertOwnRegion(replica: SimCfnDynamoDbPropertyValues): void {
    const region = replica.string("Region");

    if (region === undefined) {
      throw this.values.error("Replicas.0.Region is required");
    }

    if (region !== this.regionName) {
      throw this.values.error(
        `Replicas.0.Region is ${region}, and the stack is deploying into ` +
          `${this.regionName}, so the replica list does not include the ` +
          `region the table would be created in`,
      );
    }
  }

  /**
   * The refusal that skips a global table which genuinely replicates.
   *
   * The "Unsupported sim ... CloudFormation" wording is what marks the Resource
   * as skipped rather than failing the stack.
   */
  private replicatedError(
    replicas: readonly SimCfnDynamoDbPropertyValues[],
  ): Error {
    const regions = replicas
      .map((replica, index) => {
        return replica.string("Region") ?? `Replicas.${index.toString()}`;
      })
      .join(", ");

    return new Error(
      `Unsupported sim DynamoDB CloudFormation Resource ${this.logicalId}: ` +
        `Replicas names ${regions}, and replicating a table between regions ` +
        `is not simulated, so the global table is skipped rather than ` +
        `created as an ordinary table in one of them`,
    );
  }
}
