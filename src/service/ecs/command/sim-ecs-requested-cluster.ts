import {
  simEcsDefaultClusterName,
  type SimEcsClusterArn,
} from "../cluster/sim-ecs-cluster-arn.js";
import type { SimEcsCluster } from "../cluster/sim-ecs-cluster.js";
import type { SimEcsClusterStore } from "../cluster/sim-ecs-cluster-store.js";
import { SimEcsClusterNotFoundException } from "../error/sim-ecs.error.js";

interface SimEcsRequestedClusterProperties {
  readonly clusters: SimEcsClusterStore;
  readonly clusterArn: SimEcsClusterArn;
}

/**
 * The cluster a task operation is about.
 *
 * Every task operation takes an optional cluster and means the `default` one
 * when a request names none, and every one of them raises
 * `ClusterNotFoundException` for a cluster that is not there rather than
 * reporting a failure entry. That is one rule in four places, so it is here.
 */
export class SimEcsRequestedCluster {
  private readonly clusters: SimEcsClusterStore;
  private readonly clusterArn: SimEcsClusterArn;

  constructor(properties: SimEcsRequestedClusterProperties) {
    this.clusters = properties.clusters;
    this.clusterArn = properties.clusterArn;
  }

  /**
   * The name the request's cluster identifier comes down to.
   *
   * A name that no cluster in this Account and Region could have, such as an
   * ARN from another Region, is kept as it was given so the error names what
   * the request asked for.
   */
  name(identifier: string | undefined): string {
    if (identifier === undefined || identifier === "") {
      return simEcsDefaultClusterName;
    }

    return this.clusterArn.clusterName(identifier) ?? identifier;
  }

  /**
   * The active cluster the request named, or the default one.
   */
  active(identifier: string | undefined): SimEcsCluster {
    const clusterName = this.name(identifier);
    const cluster = this.clusters.findActive(clusterName);

    if (cluster === undefined) {
      throw new SimEcsClusterNotFoundException(
        `The simulated Account and Region hold no active cluster ` +
          `${clusterName}.`,
      );
    }

    return cluster;
  }
}
