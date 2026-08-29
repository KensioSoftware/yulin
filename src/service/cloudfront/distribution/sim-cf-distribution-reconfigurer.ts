import type { SimCloudFrontDistributionConfig } from "../command/create-distribution/create-distribution.command.js";
import type { SimCloudFrontCachePolicyRegistry } from "../cache-policy/sim-cf-cache-policy-registry.js";
import type { SimCfCustomOriginDispatcher } from "../origin/custom/sim-cf-custom-origin-dispatcher.js";
import type { SimCloudFrontS3OriginResolver } from "../origin/s3/sim-cloudfront-s3-origin.js";
import type { SimCloudFrontOriginAccessControlRegistry } from "../origin-access-control/sim-cf-origin-access-control-registry.js";
import type { SimCloudFrontOriginRequestPolicyRegistry } from "../origin-request-policy/sim-cf-origin-request-policy-registry.js";
import type { SimCloudFrontResponseHeadersPolicyRegistry } from "../response-headers-policy/sim-cf-response-headers-policy-registry.js";
import type { SimCloudFrontRegistry } from "../registry/sim-cloud-front-registry.js";
import type { SimCfWebAclResolver } from "../web-acl/sim-cf-web-acl.js";
import { makeSimCloudFrontDistributionConfigurator } from "./configurator/sim-cf-distribution-configurator.factory.js";
import type { SimCloudFrontDistributionConfigurator } from "./configurator/sim-cloud-front-distribution-configurator.js";
import type { SimCloudFrontDistribution } from "./sim-cloudfront-distribution.js";

interface SimCloudFrontDistributionReconfigurerProperties {
  readonly cloudFrontRegistry: SimCloudFrontRegistry;
  readonly s3OriginResolver: SimCloudFrontS3OriginResolver;
  readonly customOriginDispatcher?: SimCfCustomOriginDispatcher | undefined;
  readonly originAccessControls: SimCloudFrontOriginAccessControlRegistry;
  readonly responseHeadersPolicies: SimCloudFrontResponseHeadersPolicyRegistry;
  readonly cachePolicies: SimCloudFrontCachePolicyRegistry;
  readonly originRequestPolicies: SimCloudFrontOriginRequestPolicyRegistry;
  readonly webAclResolver?: SimCfWebAclResolver | undefined;
}

/**
 * Applies a replacement DistributionConfig to a Distribution already in place.
 *
 * CloudFront takes a whole DistributionConfig on an update rather than a
 * patch, so an update is a replacement: everything derived from the previous
 * config is dropped, and the new one is applied by the same configurators that
 * apply it at creation.
 */
export class SimCloudFrontDistributionReconfigurer {
  private readonly cloudFrontRegistry: SimCloudFrontRegistry;
  private readonly configurator: SimCloudFrontDistributionConfigurator;

  constructor(properties: SimCloudFrontDistributionReconfigurerProperties) {
    this.cloudFrontRegistry = properties.cloudFrontRegistry;
    this.configurator = makeSimCloudFrontDistributionConfigurator(properties);
  }

  /**
   * Apply a replacement DistributionConfig, resynchronizing the alternate
   * domain names the Distribution answers on so a name the update drops is
   * free for another Distribution.
   *
   * Everything an update can be refused for that is not a property of the
   * config itself — a name another Distribution already holds, a response
   * headers policy no longer there — is checked before anything is changed, so
   * a rejected update leaves the Distribution as it was rather than half
   * replaced.
   */
  reconfigure(
    distribution: SimCloudFrontDistribution,
    distributionConfig: SimCloudFrontDistributionConfig,
  ): void {
    const { distributionId } = distribution;

    this.cloudFrontRegistry.assertAlternateDomainNamesAvailable(
      distributionConfig.Aliases?.Items ?? [],
      distributionId,
    );
    this.configurator.assertConfigurable(distributionConfig);

    this.cloudFrontRegistry.deregisterAlternateDomainNames(distributionId);

    distribution.replaceConfiguration(distributionConfig);
    this.configurator.configure(distribution, distributionConfig);

    for (const alternateDomainName of distribution.getAlternateDomainNames()) {
      this.cloudFrontRegistry.registerAlternateDomainName(
        alternateDomainName,
        distributionId,
      );
    }
  }
}
