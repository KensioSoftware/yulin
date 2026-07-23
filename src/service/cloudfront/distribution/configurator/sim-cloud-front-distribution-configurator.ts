import type { SimCloudFrontDistributionConfig } from "../../command/create-distribution/create-distribution.cmd.js";
import type { SimCloudFrontDistribution } from "../sim-cloudfront-distribution.js";
import type { SimCloudFrontOriginConfigurator } from "./sim-cloud-front-origin-configurator.js";
import type { SimCloudFrontBehaviorConfigurator } from "./sim-cloud-front-behavior-configurator.js";

/**
 * Applies top-level Distribution configuration to a sim CloudFront Distribution.
 *
 * Orchestrates the three configuration steps in the order CloudFront requires:
 * 1. Alternate domain names (Aliases)
 * 2. Origins
 * 3. Cache Behaviors (default first, then named patterns)
 *
 * Named Cache Behaviors must be added after the default so that the default
 * always acts as the fallback when no path pattern matches.
 */
export class SimCloudFrontDistributionConfigurator {
  constructor(
    private readonly originConfigurator: SimCloudFrontOriginConfigurator,
    private readonly behaviorConfigurator: SimCloudFrontBehaviorConfigurator,
  ) {}

  /**
   * Configure a Distribution from its DistributionConfig.
   */
  configure(
    distribution: SimCloudFrontDistribution,
    distributionConfig: SimCloudFrontDistributionConfig,
  ): void {
    const aliasItems = distributionConfig.Aliases?.Items ?? [];
    for (const alias of aliasItems) {
      distribution.addAlternateDomainName(alias);
    }

    const originItems = distributionConfig.Origins?.Items ?? [];
    for (const origin of originItems) {
      this.originConfigurator.configure(distribution, origin);
    }

    this.behaviorConfigurator.configureDefaultCacheBehavior(
      distribution,
      distributionConfig.DefaultCacheBehavior,
    );

    const cacheBehaviorItems = distributionConfig.CacheBehaviors?.Items ?? [];
    for (const cacheBehavior of cacheBehaviorItems) {
      this.behaviorConfigurator.configureCacheBehavior(
        distribution,
        cacheBehavior,
      );
    }
  }
}
