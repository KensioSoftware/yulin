import type { SimCfCustomOriginDispatcher } from "../../origin/custom/sim-cf-custom-origin-dispatcher.js";
import type { SimCloudFrontS3OriginResolver } from "../../origin/s3/sim-cloudfront-s3-origin.js";
import type { SimCloudFrontOriginAccessControlRegistry } from "../../origin-access-control/sim-cf-origin-access-control-registry.js";
import type { SimCloudFrontResponseHeadersPolicyRegistry } from "../../response-headers-policy/sim-cf-response-headers-policy-registry.js";
import { SimCfDistributionWebAcl } from "../../web-acl/sim-cf-distribution-web-acl.js";
import type { SimCfWebAclResolver } from "../../web-acl/sim-cf-web-acl.js";
import { SimCfBehaviorResponseHeadersPolicy } from "./sim-cf-behavior-response-headers-policy.js";
import { SimCloudFrontBehaviorConfigurator } from "./sim-cloud-front-behavior-configurator.js";
import { SimCloudFrontDistributionConfigurator } from "./sim-cloud-front-distribution-configurator.js";
import { SimCloudFrontOriginConfigurator } from "./sim-cloud-front-origin-configurator.js";

interface SimCloudFrontConfiguratorProperties {
  readonly s3OriginResolver: SimCloudFrontS3OriginResolver;
  readonly customOriginDispatcher?: SimCfCustomOriginDispatcher | undefined;
  readonly originAccessControls: SimCloudFrontOriginAccessControlRegistry;
  readonly responseHeadersPolicies: SimCloudFrontResponseHeadersPolicyRegistry;
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
  const responseHeadersPolicy = new SimCfBehaviorResponseHeadersPolicy(
    properties.responseHeadersPolicies,
  );

  return new SimCloudFrontDistributionConfigurator(
    new SimCloudFrontOriginConfigurator(
      properties.s3OriginResolver,
      properties.originAccessControls,
      properties.customOriginDispatcher,
    ),
    new SimCloudFrontBehaviorConfigurator(responseHeadersPolicy),
    responseHeadersPolicy,
    new SimCfDistributionWebAcl(properties.webAclResolver),
  );
}
