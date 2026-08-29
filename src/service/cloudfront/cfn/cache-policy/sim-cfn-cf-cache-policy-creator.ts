import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCloudFront } from "../../sim-cloudfront.js";
import type { SimCloudFrontCachePolicy } from "../../cache-policy/sim-cf-cache-policy.js";
import { SimCfnCfCachePolicyConfig } from "./sim-cfn-cf-cache-policy-config.js";

interface SimCfnCfCachePolicyCreatorProperties {
  readonly cloudFront: SimCloudFront;
}

/**
 * Creates simulated cache policies from AWS::CloudFront::CachePolicy
 * Resources.
 */
export class SimCfnCfCachePolicyCreator {
  private readonly cloudFront: SimCloudFront;

  constructor(properties: SimCfnCfCachePolicyCreatorProperties) {
    this.cloudFront = properties.cloudFront;
  }

  /**
   * Create and store the policy one Resource describes.
   */
  create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): SimCloudFrontCachePolicy {
    const policy = new SimCfnCfCachePolicyConfig({
      resource,
      properties,
    }).build();

    this.cloudFront.addCachePolicy(policy);

    return policy;
  }

  /**
   * Remove a policy created from a Resource.
   */
  delete(resource: SimCfnResource): void {
    const policy = resource.simResource as SimCloudFrontCachePolicy | undefined;

    if (policy === undefined) {
      return;
    }

    this.cloudFront.removeCachePolicy(policy.id);
  }
}
