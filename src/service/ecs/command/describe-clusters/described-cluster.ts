import type { SimEcsClusterArn } from "../../cluster/sim-ecs-cluster-arn.js";
import type {
  SimEcsCluster,
  SimEcsClusterDetail,
  SimEcsClusterIncludes,
} from "../../cluster/sim-ecs-cluster.js";
import type { SimEcsClusterStore } from "../../cluster/sim-ecs-cluster-store.js";
import type { SimEcsAuthorizer } from "../authorize/sim-ecs-authorizer.js";
import type { SimEcsRequestOptions } from "../sim-ecs-request-options.js";
import type { SimEcsFailure } from "./describe-clusters.command.js";

interface DescribedClusterProperties {
  readonly clusters: SimEcsClusterStore;
  readonly clusterArn: SimEcsClusterArn;
  readonly authorizer: SimEcsAuthorizer;
}

/**
 * What one named cluster came to.
 */
export interface DescribedCluster {
  readonly detail?: SimEcsClusterDetail | undefined;
  readonly failure?: SimEcsFailure | undefined;
}

/**
 * Describes one cluster a request named.
 *
 * A cluster that is not there comes back as a failure rather than raising, as
 * real ECS reports it, which is what lets one request answer for several
 * clusters at once. A deleted cluster is still described, as `INACTIVE`.
 */
export class SimEcsClusterDescriber {
  private readonly clusters: SimEcsClusterStore;
  private readonly clusterArn: SimEcsClusterArn;
  private readonly authorizer: SimEcsAuthorizer;

  constructor(properties: DescribedClusterProperties) {
    this.clusters = properties.clusters;
    this.clusterArn = properties.clusterArn;
    this.authorizer = properties.authorizer;
  }

  /**
   * Describe the cluster an identifier names, authorizing against its ARN.
   *
   * Authorization comes before the store is read, so a caller with no
   * permission cannot learn from the answer whether the cluster is there.
   */
  describe(
    identifier: string,
    includes: SimEcsClusterIncludes,
    options: SimEcsRequestOptions | undefined,
  ): DescribedCluster {
    const clusterName = this.clusterArn.clusterName(identifier);
    const arn = this.arnFor(identifier, clusterName);

    this.authorizer.authorizeCluster("ecs:DescribeClusters", arn, options);

    const cluster = this.held(clusterName);

    if (cluster === undefined) {
      return { failure: { arn, reason: "MISSING" } };
    }

    return { detail: cluster.toOutput(includes) };
  }

  private arnFor(identifier: string, clusterName: string | undefined): string {
    if (clusterName === undefined) {
      return identifier;
    }

    return this.clusterArn.make(clusterName);
  }

  private held(clusterName: string | undefined): SimEcsCluster | undefined {
    if (clusterName === undefined) {
      return undefined;
    }

    return this.clusters.find(clusterName);
  }
}
