import type { SimEcsCluster } from "./sim-ecs-cluster.js";

/**
 * The simulated ECS clusters one Account and Region holds.
 *
 * Clusters are keyed by name because a cluster name is unique within an
 * Account and Region on real ECS, and because both forms a request can name a
 * cluster by, the short name and the ARN, come down to that name.
 *
 * A deleted cluster is kept rather than removed. It is still describable, as
 * it is on real ECS, and creating a cluster with its name again replaces it
 * with a new active one.
 */
export class SimEcsClusterStore {
  private readonly clusters = new Map<string, SimEcsCluster>();

  /**
   * Hold a cluster, replacing any earlier one of the same name.
   */
  put(cluster: SimEcsCluster): void {
    this.clusters.set(cluster.clusterName, cluster);
  }

  /**
   * Find a cluster by name, whether it is active or deleted.
   */
  find(clusterName: string): SimEcsCluster | undefined {
    return this.clusters.get(clusterName);
  }

  /**
   * Find an active cluster by name.
   */
  findActive(clusterName: string): SimEcsCluster | undefined {
    const cluster = this.clusters.get(clusterName);

    if (cluster?.isActive() !== true) {
      return undefined;
    }

    return cluster;
  }

  /**
   * The active clusters, in the order they were created.
   */
  active(): readonly SimEcsCluster[] {
    return this.clusters
      .values()
      .filter((cluster) => cluster.isActive())
      .toArray();
  }
}
