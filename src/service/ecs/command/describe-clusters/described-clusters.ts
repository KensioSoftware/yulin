import { simEcsDefaultClusterName } from "../../cluster/sim-ecs-cluster-arn.js";
import type {
  SimEcsClusterDetail,
  SimEcsClusterIncludes,
} from "../../cluster/sim-ecs-cluster.js";
import type { SimEcsClusterCommandContext } from "../sim-ecs-command-context.js";
import type { SimEcsRequestOptions } from "../sim-ecs-request-options.js";
import { SimEcsClusterDescriber } from "./described-cluster.js";
import type { SimEcsFailure } from "./describe-clusters.command.js";

/**
 * What a `DescribeClusters` request answers with.
 */
export interface DescribedClustersOutput {
  readonly clusters: readonly SimEcsClusterDetail[];
  readonly failures: readonly SimEcsFailure[];
}

/**
 * Describes the clusters one request named, splitting answers from failures.
 */
export class DescribedClusters {
  private readonly describer: SimEcsClusterDescriber;

  constructor(context: SimEcsClusterCommandContext) {
    this.describer = new SimEcsClusterDescriber(context);
  }

  /**
   * Describe each identifier a request named.
   */
  describe(
    identifiers: readonly string[],
    includes: SimEcsClusterIncludes,
    options: SimEcsRequestOptions | undefined,
  ): DescribedClustersOutput {
    const described = this.requested(identifiers).map((identifier) =>
      this.describer.describe(identifier, includes, options),
    );

    return {
      clusters: described
        .map((one) => one.detail)
        .filter((detail) => detail !== undefined),
      failures: described
        .map((one) => one.failure)
        .filter((failure) => failure !== undefined),
    };
  }

  /**
   * The identifiers to describe, which is the default cluster when a request
   * named none.
   */
  private requested(identifiers: readonly string[]): readonly string[] {
    if (identifiers.length === 0) {
      return [simEcsDefaultClusterName];
    }

    return identifiers;
  }
}
