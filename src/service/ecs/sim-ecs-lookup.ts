import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import type { SimEcsCluster } from "./cluster/sim-ecs-cluster.js";
import type { SimEcsClusterStore } from "./cluster/sim-ecs-cluster-store.js";
import { SimEcsClusterNotFoundException } from "./error/sim-ecs.error.js";
import { SimEcsTaskDefinitionId } from "./task-definition/sim-ecs-task-definition-id.js";
import type { SimEcsTaskDefinitionStore } from "./task-definition/sim-ecs-task-definition-store.js";
import type { SimEcsTaskDefinition } from "./task-definition/sim-ecs-task-definition.js";

interface SimEcsLookupProperties {
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly clusters: SimEcsClusterStore;
  readonly taskDefinitions: SimEcsTaskDefinitionStore;
}

/**
 * What reads simulated ECS state without being an operation.
 *
 * A command handler answers with a description, which is what an SDK caller
 * gets. A CloudFormation Resource needs the thing itself, so it can be what
 * the Stack holds and what `Ref` and `Fn::GetAtt` answer from, and a test
 * asserting on state wants the same. Both go through here rather than through
 * the stores, so the way a name is read stays the way the commands read one.
 */
export class SimEcsLookup {
  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly clusters: SimEcsClusterStore;
  private readonly taskDefinitions: SimEcsTaskDefinitionStore;

  constructor(properties: SimEcsLookupProperties) {
    this.accountRegionScope = properties.accountRegionScope;
    this.clusters = properties.clusters;
    this.taskDefinitions = properties.taskDefinitions;
  }

  /**
   * The cluster of this name, active or deleted.
   *
   * A name nothing holds is refused, since the caller asked for a cluster
   * rather than for whether there is one.
   */
  cluster(clusterName: string): SimEcsCluster {
    const cluster = this.clusters.find(clusterName);

    if (cluster === undefined) {
      throw new SimEcsClusterNotFoundException(
        `The simulated Account and Region hold no cluster ${clusterName}.`,
      );
    }

    return cluster;
  }

  /**
   * The task definition revision a family, `family:revision` or ARN names.
   */
  taskDefinition(identifier: string): SimEcsTaskDefinition {
    return this.taskDefinitions.resolve(
      SimEcsTaskDefinitionId.parse(identifier, this.accountRegionScope),
    );
  }
}
