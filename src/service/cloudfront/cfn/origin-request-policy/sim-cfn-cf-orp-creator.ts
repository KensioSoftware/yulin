import type { SimCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCloudFront } from "../../sim-cloudfront.js";
import type { SimCloudFrontOriginRequestPolicy } from "../../origin-request-policy/sim-cf-origin-request-policy.js";
import { SimCfnCfOriginRequestPolicyConfig } from "./sim-cfn-cf-orp-config.js";

interface SimCfnCfOriginRequestPolicyCreatorProperties {
  readonly cloudFront: SimCloudFront;
}

/**
 * Creates simulated origin request policies from
 * AWS::CloudFront::OriginRequestPolicy Resources.
 */
export class SimCfnCfOriginRequestPolicyCreator {
  private static readonly createAction = "cloudfront:CreateOriginRequestPolicy";
  private static readonly deleteAction = "cloudfront:DeleteOriginRequestPolicy";

  private readonly cloudFront: SimCloudFront;

  constructor(properties: SimCfnCfOriginRequestPolicyCreatorProperties) {
    this.cloudFront = properties.cloudFront;
  }

  /**
   * Create and store the policy one Resource describes.
   */
  create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
    options?: SimCfnResourceCallerOptions,
  ): SimCloudFrontOriginRequestPolicy {
    this.cloudFront
      .cfnAuthorizer()
      .authorizeAny(SimCfnCfOriginRequestPolicyCreator.createAction, options);

    const policy = new SimCfnCfOriginRequestPolicyConfig({
      resource,
      properties,
    }).build();

    this.cloudFront.addOriginRequestPolicy(policy);

    return policy;
  }

  /**
   * Remove a policy created from a Resource.
   */
  delete(
    resource: SimCfnResource,
    options?: SimCfnResourceCallerOptions,
  ): void {
    const policy = resource.simResource as
      | SimCloudFrontOriginRequestPolicy
      | undefined;

    if (policy === undefined) {
      return;
    }

    this.cloudFront
      .cfnAuthorizer()
      .authorizeResource(
        SimCfnCfOriginRequestPolicyCreator.deleteAction,
        `origin-request-policy/${policy.id}`,
        options,
      );

    this.cloudFront.removeOriginRequestPolicy(policy.id);
  }
}
