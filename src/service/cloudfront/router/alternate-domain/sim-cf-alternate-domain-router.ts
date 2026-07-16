import type {
  SimCloudFrontDistribution,
  SimCloudFrontDistributionId,
} from "../../distribution/sim-cloudfront-distribution.js";
import type { SimCloudFrontRegistry } from "../../registry/sim-cloud-front-registry.js";
import type { SimAws } from "../../../aws/sim-aws.js";
import type { SimCloudFrontDistroRoute } from "../sim-cloud-front-distro-router.js";

/**
 * Routes CloudFront alternate domain names to matching simulated Distributions.
 *
 * Lookup is attempted in two tiers:
 * 1. The inline `distributions` map — fast path for directly supplied distributions.
 * 2. The SimCloudFrontRegistry alternate-domain index — lookup for
 *    distributions created through the sim CloudFront API.
 */
export class SimCloudFrontAlternateDomainRouter {
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
   * Select the appropriate CloudFront route for an alternate domain name.
   */
  routeForAlternateDomainName(
    alternateDomainName: string,
  ): SimCloudFrontDistroRoute | undefined {
    // Tier 1: search the inline distributions map first.
    if (this.distributions !== undefined) {
      const distribution = this.distributions
        .values()
        .find((distro) => distro.hasAlternateDomainName(alternateDomainName));

      if (distribution !== undefined) {
        return {
          cloudFront: this.simAws
            .accountRegionScope(distribution.accountId)
            .cloudFront(),
          distribution,
        };
      }
    }

    const distributionId =
      this.cloudFrontRegistry.distributionIdForAlternateDomainName(
        alternateDomainName,
      );

    if (distributionId === undefined) {
      return undefined;
    }

    const accountId =
      this.cloudFrontRegistry.accountIdForDistribution(distributionId);

    if (accountId === undefined) {
      return undefined;
    }

    const cloudFront = this.simAws.accountRegionScope(accountId).cloudFront();
    const distribution = cloudFront.getSimDistributionById(distributionId);

    if (distribution === undefined) {
      return undefined;
    }

    return { cloudFront, distribution };
  }
}
