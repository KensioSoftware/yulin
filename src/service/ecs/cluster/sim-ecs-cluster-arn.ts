import type { SimArn } from "../../aws/arn.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import { parseSimEcsArn } from "../sim-ecs-arn.js";

/**
 * The cluster an ECS request means when it names no cluster at all.
 */
export const simEcsDefaultClusterName = "default";

/**
 * Builds and reads simulated ECS cluster ARNs for one Account and Region.
 *
 * A request may name a cluster by its short name or by its full ARN, and the
 * two are interchangeable everywhere ECS takes a cluster. Reading an ARN
 * belonging to another Account or Region gives no cluster rather than the
 * same-named one here, because those are different clusters on real AWS.
 */
export class SimEcsClusterArn {
  private readonly accountRegionScope: SimAwsAccountRegionScope;

  constructor(accountRegionScope: SimAwsAccountRegionScope) {
    this.accountRegionScope = accountRegionScope;
  }

  /**
   * The ARN a cluster of this name has in this Account and Region.
   */
  make(clusterName: string): SimArn {
    const { regionName, accountId } = this.accountRegionScope;

    return `arn:aws:ecs:${regionName}:${accountId}:cluster/${clusterName}`;
  }

  /**
   * Read the cluster name out of a short name or a full cluster ARN.
   *
   * Undefined covers every way an identifier can name no cluster in this
   * scope: it is not an ARN of the right shape, it is an ARN of something
   * else, or it is an ECS cluster ARN belonging to another Account or Region.
   * Callers report that in their own terms, because `DescribeClusters` reports
   * a cluster it cannot find as a failure while `DeleteCluster` raises.
   */
  clusterName(identifier: string | undefined): string | undefined {
    if (identifier === undefined || identifier === "") {
      return simEcsDefaultClusterName;
    }

    if (!identifier.startsWith("arn:")) {
      return identifier;
    }

    const arn = parseSimEcsArn(identifier);
    const { regionName, accountId } = this.accountRegionScope;

    if (
      arn?.resourceType !== "cluster" ||
      arn.region !== regionName ||
      arn.accountId !== accountId
    ) {
      return undefined;
    }

    return arn.resourceId;
  }
}
