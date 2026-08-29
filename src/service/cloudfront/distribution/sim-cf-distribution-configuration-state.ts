import type { SimAcmRegistry } from "../../acm/registry/sim-acm-registry.js";
import type { SimCloudFrontCachePolicyRegistry } from "../cache-policy/sim-cf-cache-policy-registry.js";
import type { SimCfCustomOriginDispatcher } from "../origin/custom/sim-cf-custom-origin-dispatcher.js";
import type { SimCloudFrontS3OriginResolver } from "../origin/s3/sim-cloudfront-s3-origin.js";
import type { SimCloudFrontOriginAccessControlRegistry } from "../origin-access-control/sim-cf-origin-access-control-registry.js";
import type { SimCloudFrontOriginRequestPolicyRegistry } from "../origin-request-policy/sim-cf-origin-request-policy-registry.js";
import type { SimCloudFrontResponseHeadersPolicyRegistry } from "../response-headers-policy/sim-cf-response-headers-policy-registry.js";
import type { SimCfWebAclResolver } from "../web-acl/sim-cf-web-acl.js";
import type { SimCfEdgeFunctions } from "../edge/sim-cf-edge-functions.js";

/**
 * How the commands that configure a Distribution reach everything a
 * DistributionConfig names outside itself.
 *
 * A DistributionConfig is mostly references: a Bucket or a hostname per
 * Origin, a certificate, an origin access control, a response headers policy,
 * a cache policy, an origin request policy, a web ACL, a Lambda@Edge function
 * version. None of them belongs to CloudFront, and creation and update resolve
 * every one of them the same way, so they travel together.
 */
export interface SimCfDistributionConfigurationState {
  readonly s3OriginResolver: SimCloudFrontS3OriginResolver;
  readonly customOriginDispatcher: SimCfCustomOriginDispatcher | undefined;
  readonly acmRegistry: SimAcmRegistry | undefined;
  readonly originAccessControls: SimCloudFrontOriginAccessControlRegistry;
  readonly responseHeadersPolicies: SimCloudFrontResponseHeadersPolicyRegistry;
  readonly cachePolicies: SimCloudFrontCachePolicyRegistry;
  readonly originRequestPolicies: SimCloudFrontOriginRequestPolicyRegistry;
  readonly webAclResolver: SimCfWebAclResolver | undefined;
  readonly edgeFunctions: SimCfEdgeFunctions | undefined;
}
