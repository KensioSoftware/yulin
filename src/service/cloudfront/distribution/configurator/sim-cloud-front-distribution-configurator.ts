import type { SimCloudFrontDistributionConfig } from "../../command/create-distribution/create-distribution.command.js";
import type { SimCloudFrontDistribution } from "../sim-cloudfront-distribution.js";
import type { SimCloudFrontOriginConfigurator } from "./sim-cloud-front-origin-configurator.js";
import type { SimCloudFrontBehaviorConfigurator } from "./sim-cloud-front-behavior-configurator.js";
import { SimCloudFrontCustomErrorConfigurator } from "./sim-cloud-front-custom-error-configurator.js";
import { SimCloudFrontInvalidDefaultRootObject } from "../../error/sim-cloudfront.error.js";

/**
 * Applies top-level Distribution configuration to a sim CloudFront Distribution.
 *
 * Orchestrates the configuration steps in the order CloudFront requires:
 * 1. Alternate domain names (Aliases)
 * 2. Origins
 * 3. Cache Behaviors (default first, then named patterns)
 * 4. The default root object and custom error responses, which are request
 *    handling rather than routing and so depend on nothing above them
 *
 * Named Cache Behaviors must be added after the default so that the default
 * always acts as the fallback when no path pattern matches.
 */
export class SimCloudFrontDistributionConfigurator {
  private readonly customErrorConfigurator =
    new SimCloudFrontCustomErrorConfigurator();

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

    distribution.defaultRootObject = this.defaultRootObject(
      distributionConfig.DefaultRootObject,
    );

    const customErrorItems =
      distributionConfig.CustomErrorResponses?.Items ?? [];
    for (const customErrorResponse of customErrorItems) {
      this.customErrorConfigurator.configure(distribution, customErrorResponse);
    }
  }

  /**
   * CloudFront takes the default root object as an Origin object name, so a
   * leading forward slash is refused rather than quietly stripped: in real
   * CloudFront it produces a 403 on every request to the Distribution root.
   * An empty value means no default root object, as it does in AWS.
   */
  private defaultRootObject(
    defaultRootObject: string | undefined,
  ): string | undefined {
    if (defaultRootObject === undefined || defaultRootObject === "") {
      return undefined;
    }

    if (defaultRootObject.startsWith("/")) {
      throw new SimCloudFrontInvalidDefaultRootObject(
        `CloudFront DefaultRootObject ${defaultRootObject} must not begin with a forward slash`,
      );
    }

    return defaultRootObject;
  }
}
