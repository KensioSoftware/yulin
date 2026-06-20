import type {
  SimCloudFrontDistribution,
  SimCloudFrontDistributionId,
} from "../distribution/sim-cloudfront-distribution.js";
import type { SimCloudFrontRegistry } from "../sim-cloud-front-registry.js";
import type { SimAws } from "../../aws/sim-aws.js";
import type { SimCloudFrontDistroRoute } from "./sim-cloud-front-distro-router.js";

/**
 * Routes CloudFront alternate domain names to matching simulated Distributions.
 *
 * Lookup is attempted in two tiers:
 * 1. The inline `distributions` map — fast path for directly supplied distributions.
 * 2. All accounts known to the SimCloudFrontRegistry — needed when distributions
 *    were created through the sim CloudFront API rather than supplied inline.
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
      const distribution = [...this.distributions.values()].find((distro) =>
        distro.hasAlternateDomainName(alternateDomainName),
      );

      if (distribution !== undefined) {
        return {
          cloudFront: this.simAws
            .accountRegionScope(distribution.accountId)
            .cloudFront(),
          distribution,
        };
      }
    }

    // Tier 2: walk every registered account and search their live distributions.
    // This is exhaustive — alternate domain names are not indexed in the
    // registry, so a full scan is required.
    for (const accountId of this.cloudFrontRegistry.accountIdsWithDistributions()) {
      const cloudFront = this.simAws.accountRegionScope(accountId).cloudFront();
      const distribution = [...cloudFront.getDistributions().values()].find(
        (distro) => distro.hasAlternateDomainName(alternateDomainName),
      );

      if (distribution !== undefined) {
        return { cloudFront, distribution };
      }
    }

    return undefined;
  }
}
