import {
  simEcsDefaultClusterName,
  type SimEcsClusterArn,
} from "../../cluster/sim-ecs-cluster-arn.js";
import { SimEcsCluster } from "../../cluster/sim-ecs-cluster.js";
import type { SimEcsClusterStore } from "../../cluster/sim-ecs-cluster-store.js";
import { requiredSimEcsName } from "../../sim-ecs-name.js";
import type { SimCreateClusterCommandInput } from "./create-cluster.command.js";

interface CreateClusterFactoryProperties {
  readonly clusters: SimEcsClusterStore;
  readonly clusterArn: SimEcsClusterArn;
}

/**
 * Makes the cluster a CreateCluster request asked for.
 *
 * Real ECS answers a repeated CreateCluster with the cluster already holding
 * the name rather than an error, which is what makes a stack deploying the
 * same cluster twice work. That is why this finds before it makes.
 */
export class CreateClusterFactory {
  private readonly clusters: SimEcsClusterStore;
  private readonly clusterArn: SimEcsClusterArn;

  constructor(properties: CreateClusterFactoryProperties) {
    this.clusters = properties.clusters;
    this.clusterArn = properties.clusterArn;
  }

  /**
   * The name a request asked for, which is `default` when it asked for none.
   */
  static clusterName(input: SimCreateClusterCommandInput): string {
    if (input.clusterName === undefined) {
      return simEcsDefaultClusterName;
    }

    return requiredSimEcsName(input.clusterName, "cluster name");
  }

  /**
   * The cluster this request means, made and held if it is not already there.
   */
  make(
    input: SimCreateClusterCommandInput,
    clusterName: string,
  ): SimEcsCluster {
    const held = this.clusters.findActive(clusterName);

    if (held !== undefined) {
      return held;
    }

    const cluster = new SimEcsCluster({
      clusterArn: this.clusterArn.make(clusterName),
      clusterName,
      settings: input.settings,
      configuration: input.configuration,
      tags: input.tags,
    });

    this.clusters.put(cluster);

    return cluster;
  }
}
