import type { SimCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCloudFront } from "../../sim-cloudfront.js";
import { SimCfnCfCachePolicyCreator } from "../cache-policy/sim-cfn-cf-cache-policy-creator.js";
import { SimCfnCfOriginAccessControlCreator } from "../origin-access-control/sim-cfn-cf-oac-creator.js";
import { SimCfnCfOriginRequestPolicyCreator } from "../origin-request-policy/sim-cfn-cf-orp-creator.js";
import { SimCfnCfResponseHeadersPolicyCreator } from "../response-headers-policy/sim-cfn-cf-rh-policy-creator.js";

/**
 * What the four creators in here have in common.
 *
 * Each builds its own kind of policy from a Resource's properties and stores
 * it on the simulated CloudFront, and each authorizes the deployment's caller
 * for its own pair of actions.
 */
interface SimCfnCfPolicyCreator {
  create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
    options?: SimCfnResourceCallerOptions,
  ): object;
  delete(resource: SimCfnResource, options?: SimCfnResourceCallerOptions): void;
}

/**
 * The CloudFront Resource types a template is the only way to make.
 *
 * A cache policy, an origin request policy, a response headers policy and an
 * origin access control have no SDK command here. The Resource factory hands
 * all four to this one lookup, and its own switch stays about the Resource
 * types a command creates.
 */
export class SimCfnCfPolicyCreators {
  private readonly creators: ReadonlyMap<string, SimCfnCfPolicyCreator>;

  constructor(cloudFront: SimCloudFront) {
    this.creators = new Map<string, SimCfnCfPolicyCreator>([
      [
        "ResponseHeadersPolicy",
        new SimCfnCfResponseHeadersPolicyCreator({ cloudFront }),
      ],
      ["CachePolicy", new SimCfnCfCachePolicyCreator({ cloudFront })],
      [
        "OriginRequestPolicy",
        new SimCfnCfOriginRequestPolicyCreator({ cloudFront }),
      ],
      [
        "OriginAccessControl",
        new SimCfnCfOriginAccessControlCreator({ cloudFront }),
      ],
    ]);
  }

  /**
   * The creator owning one Resource type, or nothing where another part of
   * the factory owns it.
   */
  creatorFor(resourceTypeName: string): SimCfnCfPolicyCreator | undefined {
    return this.creators.get(resourceTypeName);
  }
}
