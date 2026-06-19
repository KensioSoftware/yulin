import type {
  SimCloudFrontDistribution,
  SimCloudFrontDistributionId,
} from "../distribution/sim-cloudfront-distribution.js";
import type { SimCloudFrontRegistry } from "../sim-cloud-front-registry.js";
import type { SimAws } from "../../aws/sim-aws.js";
import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import type { SimCloudFront } from "../sim-cloudfront.js";
import type { SimCloudFrontDistroRoute } from "./sim-cloud-front-distro-router.js";

/**
 * Routes a CloudFront Distribution ID to the appropriate sim Distribution.
 *
 * Lookup is attempted in two tiers:
 * 1. The inline `distributions` map — used when distributions are supplied
 *    directly (e.g. via SimCloudFrontDistroRouter.fromDistributions), without
 *    needing a registry.
 * 2. The SimCloudFrontRegistry — used when distributions were created through
 *    the normal sim CloudFront API and registered against an account.
 */
export class SimCloudFrontDistroIdRouter {
  private readonly simAws: SimAws;
  private readonly cloudFrontRegistry: SimCloudFrontRegistry;
  private readonly distributions?:
    | ReadonlyMap<SimCloudFrontDistributionId, SimCloudFrontDistribution>
    | undefined;

  constructor(props: {
    readonly simAws: SimAws;
    readonly cloudFrontRegistry: SimCloudFrontRegistry;
    readonly distributions?: ReadonlyMap<
      SimCloudFrontDistributionId,
      SimCloudFrontDistribution
    >;
  }) {
    this.simAws = props.simAws;
    this.cloudFrontRegistry = props.cloudFrontRegistry;
    this.distributions = props.distributions;
  }

  /**
   * Select the appropriate CloudFront route for a Distribution ID.
   *
   * Returns undefined if the ID is not found in either the inline
   * Distributions map or the Registry.
   */
  routeForDistributionId(
    distributionId: SimCloudFrontDistributionId,
  ): SimCloudFrontDistroRoute | undefined {
    // Tier 1: check the inline distributions map first.
    const fallbackDistribution = this.distributions?.get(distributionId);
    if (fallbackDistribution !== undefined) {
      return {
        cloudFront: this.cloudFrontForAccount(fallbackDistribution.accountId),
        distribution: fallbackDistribution,
      };
    }

    // Tier 2: look up via the registry to find which account owns this ID,
    // then retrieve the live distribution from that account's CloudFront scope.
    const accountId =
      this.cloudFrontRegistry.accountIdForDistribution(distributionId);
    if (accountId === undefined) {
      return undefined;
    }

    const cloudFront = this.cloudFrontForAccount(accountId);
    const distribution = cloudFront.getDistributions().get(distributionId);

    if (distribution === undefined) {
      return undefined;
    }

    return { cloudFront, distribution };
  }

  private cloudFrontForAccount(accountId: SimAwsAccountId): SimCloudFront {
    return this.simAws.accountRegionScope(accountId).cloudFront();
  }
}
