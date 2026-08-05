import type { SimCfnDynamoDbPropertyValues } from "../property/sim-cfn-dynamodb-property-values.js";
import type { SimCfnDynamoDbResourceScope } from "../property/sim-cfn-dynamodb-resource-scope.js";

interface SimCfnDynamoDbGlobalTableReplicasProperties {
  readonly scope: SimCfnDynamoDbResourceScope;
  readonly regionName: string;
  readonly values: SimCfnDynamoDbPropertyValues;
}

/**
 * The one replica a global table this simulation creates is made of.
 *
 * A global table naming one replica is an ordinary table in that region,
 * because with one replica that is what it is. CDK's `TableV2` synthesises one
 * for every table it makes, since `renderReplicaTables` always appends the
 * stack's own region, so a table with no `replicas` prop at all arrives here.
 *
 * Two or more replicas is a table that replicates, which is not simulated. The
 * table is still created, as the one in the region the stack is deploying
 * into, and the replication nothing here performs is recorded against the
 * Resource. That is more useful than no table at all: everything the table does
 * within one region behaves as the template describes, and only the copying
 * between regions is missing.
 *
 * A replica list with nothing in it, or with nothing in the stack's own region,
 * is refused rather than recorded. Real CloudFormation refuses both, so there
 * is no gap in this simulation to be best effort about.
 */
export class SimCfnDynamoDbGlobalTableReplicas {
  private readonly scope: SimCfnDynamoDbResourceScope;
  private readonly regionName: string;
  private readonly values: SimCfnDynamoDbPropertyValues;

  constructor(properties: SimCfnDynamoDbGlobalTableReplicasProperties) {
    this.scope = properties.scope;
    this.regionName = properties.regionName;
    this.values = properties.values;
  }

  /**
   * The replica this global table is created as, recording the rest.
   */
  single(): SimCfnDynamoDbPropertyValues {
    const replicas = this.values.list("Replicas");
    const [only] = replicas;

    if (only === undefined) {
      throw this.values.error(
        "Replicas must name at least one region, since a global table with " +
          "no replica is a table in no region, and real CloudFormation " +
          "refuses that template too",
      );
    }

    if (replicas.length === 1) {
      return this.onlyReplica(only);
    }

    return this.ownRegionReplica(replicas);
  }

  /**
   * The single replica a template declared, which has to name the region the
   * stack is deploying into.
   *
   * Real CloudFormation requires the replica list to include the stack's own
   * region, so a template naming one region and deploying into another is one
   * it refuses as well.
   */
  private onlyReplica(
    replica: SimCfnDynamoDbPropertyValues,
  ): SimCfnDynamoDbPropertyValues {
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

    return replica;
  }

  /**
   * The replica in the stack's own region, out of the several a replicating
   * table declares, recording the replication that will not happen.
   */
  private ownRegionReplica(
    replicas: readonly SimCfnDynamoDbPropertyValues[],
  ): SimCfnDynamoDbPropertyValues {
    const own = replicas.find((replica) => {
      return replica.string("Region") === this.regionName;
    });

    if (own === undefined) {
      throw this.values.error(
        `Replicas names ${this.regionNames(replicas)}, and the stack is ` +
          `deploying into ${this.regionName}, so the replica list does not ` +
          `include the region the table would be created in`,
      );
    }

    this.scope.ignorer.ignoreProperty(
      "Replicas",
      `Replicas names ${this.regionNames(replicas)}, and replicating a table ` +
        `between regions is not simulated, so the table is created as an ` +
        `ordinary table in ${this.regionName} and nothing is copied to the ` +
        `others`,
    );

    return own;
  }

  /**
   * The regions a replica list names, for a message that says which they were.
   */
  private regionNames(
    replicas: readonly SimCfnDynamoDbPropertyValues[],
  ): string {
    return replicas
      .map((replica, index) => {
        return replica.string("Region") ?? `Replicas.${index.toString()}`;
      })
      .join(", ");
  }
}
