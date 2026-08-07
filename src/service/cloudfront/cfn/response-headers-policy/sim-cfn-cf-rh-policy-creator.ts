import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCloudFront } from "../../sim-cloudfront.js";
import type { SimCloudFrontResponseHeadersPolicy } from "../../response-headers-policy/sim-cf-response-headers-policy.js";
import { SimCfnCfResponseHeadersPolicyConfig } from "./sim-cfn-cf-rh-policy-config.js";

interface SimCfnCfResponseHeadersPolicyCreatorProperties {
  readonly cloudFront: SimCloudFront;
}

/**
 * Creates simulated response headers policies from
 * AWS::CloudFront::ResponseHeadersPolicy Resources.
 */
export class SimCfnCfResponseHeadersPolicyCreator {
  private readonly cloudFront: SimCloudFront;

  constructor(properties: SimCfnCfResponseHeadersPolicyCreatorProperties) {
    this.cloudFront = properties.cloudFront;
  }

  /**
   * Create and store the policy one Resource describes.
   */
  create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): SimCloudFrontResponseHeadersPolicy {
    const policy = new SimCfnCfResponseHeadersPolicyConfig({
      resource,
      properties,
    }).build();

    this.cloudFront.addResponseHeadersPolicy(policy);

    return policy;
  }

  /**
   * Remove a policy created from a Resource.
   */
  delete(resource: SimCfnResource): void {
    const policy = resource.simResource as
      SimCloudFrontResponseHeadersPolicy | undefined;

    if (policy === undefined) {
      return;
    }

    this.cloudFront.removeResponseHeadersPolicy(policy.id);
  }
}
