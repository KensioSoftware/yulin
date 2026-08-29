import type {
  SimCloudFrontCachePolicy,
  SimCloudFrontCachePolicyId,
} from "./cache-policy/sim-cf-cache-policy.js";
import { SimCloudFrontCachePolicyRegistry } from "./cache-policy/sim-cf-cache-policy-registry.js";
import type {
  SimCloudFrontOriginRequestPolicy,
  SimCloudFrontOriginRequestPolicyId,
} from "./origin-request-policy/sim-cf-origin-request-policy.js";
import { SimCloudFrontOriginRequestPolicyRegistry } from "./origin-request-policy/sim-cf-origin-request-policy-registry.js";
import type {
  SimCloudFrontResponseHeadersPolicy,
  SimCloudFrontResponseHeadersPolicyId,
} from "./response-headers-policy/sim-cf-response-headers-policy.js";
import { SimCloudFrontResponseHeadersPolicyRegistry } from "./response-headers-policy/sim-cf-response-headers-policy-registry.js";

/**
 * The policies one simulated CloudFront holds.
 *
 * A cache Behavior names a response headers policy, a cache policy and an
 * origin request policy by ID, and all three are stored here. None of them has
 * a create command in this simulation, so CloudFormation is the only thing
 * that makes one, and these methods are how it hands a policy over.
 * `SimCloudFront` extends this, and a caller reaches the policies on the one
 * service object.
 */
export class SimCloudFrontPolicies {
  protected readonly responseHeadersPolicies =
    new SimCloudFrontResponseHeadersPolicyRegistry();
  protected readonly cachePolicies = new SimCloudFrontCachePolicyRegistry();
  protected readonly originRequestPolicies =
    new SimCloudFrontOriginRequestPolicyRegistry();

  /**
   * Store a simulated response headers policy. A name another policy already
   * holds is refused, as CloudFront refuses one.
   */
  addResponseHeadersPolicy(policy: SimCloudFrontResponseHeadersPolicy): void {
    this.responseHeadersPolicies.add(policy);
  }

  /**
   * Forget a simulated response headers policy.
   */
  removeResponseHeadersPolicy(
    policyId: SimCloudFrontResponseHeadersPolicyId,
  ): void {
    this.responseHeadersPolicies.remove(policyId);
  }

  /**
   * Get a simulated response headers policy by ID.
   */
  getResponseHeadersPolicyById(
    policyId: SimCloudFrontResponseHeadersPolicyId | string,
  ): SimCloudFrontResponseHeadersPolicy | undefined {
    return this.responseHeadersPolicies.byId(policyId);
  }

  /**
   * Store a simulated cache policy. A name another policy already holds is
   * refused, as CloudFront refuses one.
   */
  addCachePolicy(policy: SimCloudFrontCachePolicy): void {
    this.cachePolicies.add(policy);
  }

  /**
   * Forget a simulated cache policy.
   */
  removeCachePolicy(policyId: SimCloudFrontCachePolicyId): void {
    this.cachePolicies.remove(policyId);
  }

  /**
   * Get a simulated cache policy by ID.
   */
  getCachePolicyById(
    policyId: SimCloudFrontCachePolicyId | string,
  ): SimCloudFrontCachePolicy | undefined {
    return this.cachePolicies.byId(policyId);
  }

  /**
   * Store a simulated origin request policy. A name another policy already
   * holds is refused, as CloudFront refuses one.
   */
  addOriginRequestPolicy(policy: SimCloudFrontOriginRequestPolicy): void {
    this.originRequestPolicies.add(policy);
  }

  /**
   * Forget a simulated origin request policy.
   */
  removeOriginRequestPolicy(
    policyId: SimCloudFrontOriginRequestPolicyId,
  ): void {
    this.originRequestPolicies.remove(policyId);
  }

  /**
   * Get a simulated origin request policy by ID.
   */
  getOriginRequestPolicyById(
    policyId: SimCloudFrontOriginRequestPolicyId | string,
  ): SimCloudFrontOriginRequestPolicy | undefined {
    return this.originRequestPolicies.byId(policyId);
  }
}
