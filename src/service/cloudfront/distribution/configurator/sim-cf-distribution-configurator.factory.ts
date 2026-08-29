import type { SimCloudFrontCachePolicyRegistry } from "../../cache-policy/sim-cf-cache-policy-registry.js";
import type { SimCfCustomOriginDispatcher } from "../../origin/custom/sim-cf-custom-origin-dispatcher.js";
import type { SimCloudFrontS3OriginResolver } from "../../origin/s3/sim-cloudfront-s3-origin.js";
import type { SimCloudFrontOriginAccessControlRegistry } from "../../origin-access-control/sim-cf-origin-access-control-registry.js";
import type { SimCloudFrontOriginRequestPolicyRegistry } from "../../origin-request-policy/sim-cf-origin-request-policy-registry.js";
import type { SimCloudFrontResponseHeadersPolicyRegistry } from "../../response-headers-policy/sim-cf-response-headers-policy-registry.js";
import { SimCfDistributionWebAcl } from "../../web-acl/sim-cf-distribution-web-acl.js";
import type { SimCfWebAclResolver } from "../../web-acl/sim-cf-web-acl.js";
import { SimCfBehaviorCachePolicy } from "./sim-cf-behavior-cache-policy.js";
import { SimCfBehaviorOriginRequestPolicy } from "./sim-cf-behavior-origin-request-policy.js";
import { SimCfBehaviorPolicies } from "./sim-cf-behavior-policies.js";
import { SimCfBehaviorResponseHeadersPolicy } from "./sim-cf-behavior-response-headers-policy.js";
import { SimCloudFrontBehaviorConfigurator } from "./sim-cloud-front-behavior-configurator.js";
import { SimCloudFrontDistributionConfigurator } from "./sim-cloud-front-distribution-configurator.js";
import { SimCloudFrontOriginConfigurator } from "./sim-cloud-front-origin-configurator.js";

interface SimCloudFrontConfiguratorProperties {
  readonly s3OriginResolver: SimCloudFrontS3OriginResolver;
  readonly customOriginDispatcher?: SimCfCustomOriginDispatcher | undefined;
  readonly originAccessControls: SimCloudFrontOriginAccessControlRegistry;
  readonly responseHeadersPolicies: SimCloudFrontResponseHeadersPolicyRegistry;
  readonly cachePolicies: SimCloudFrontCachePolicyRegistry;
  readonly originRequestPolicies: SimCloudFrontOriginRequestPolicyRegistry;
  readonly webAclResolver?: SimCfWebAclResolver | undefined;
}

/**
 * Build the configurator that applies a DistributionConfig to a Distribution.
 *
 * Creation and update apply the same config the same way, so they build the
 * same set of configurators.
 */
export function makeSimCloudFrontDistributionConfigurator(
  properties: SimCloudFrontConfiguratorProperties,
): SimCloudFrontDistributionConfigurator {
  const behaviorPolicies = new SimCfBehaviorPolicies(
    new SimCfBehaviorResponseHeadersPolicy(properties.responseHeadersPolicies),
    new SimCfBehaviorCachePolicy(properties.cachePolicies),
    new SimCfBehaviorOriginRequestPolicy(properties.originRequestPolicies),
  );

  return new SimCloudFrontDistributionConfigurator(
    new SimCloudFrontOriginConfigurator(
      properties.s3OriginResolver,
      properties.originAccessControls,
      {
        cachePolicies: properties.cachePolicies,
        originRequestPolicies: properties.originRequestPolicies,
      },
      properties.customOriginDispatcher,
    ),
    new SimCloudFrontBehaviorConfigurator(behaviorPolicies),
    behaviorPolicies,
    new SimCfDistributionWebAcl(properties.webAclResolver),
  );
}
