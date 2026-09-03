import type { SimCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";
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
  private static readonly createAction = "cloudfront:CreateCachePolicy";
  private static readonly deleteAction = "cloudfront:DeleteCachePolicy";

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
    options?: SimCfnResourceCallerOptions,
  ): SimCloudFrontCachePolicy {
    this.cloudFront
      .cfnAuthorizer()
      .authorizeAny(SimCfnCfCachePolicyCreator.createAction, options);

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
  delete(
    resource: SimCfnResource,
    options?: SimCfnResourceCallerOptions,
  ): void {
    const policy = resource.simResource as SimCloudFrontCachePolicy | undefined;

    if (policy === undefined) {
      return;
    }

    this.cloudFront
      .cfnAuthorizer()
      .authorizeResource(
        SimCfnCfCachePolicyCreator.deleteAction,
        `cache-policy/${policy.id}`,
        options,
      );

    this.cloudFront.removeCachePolicy(policy.id);
  }
}
