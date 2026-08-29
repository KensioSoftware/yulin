import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCloudFrontOriginRequestPolicy } from "../../../../cloudfront/origin-request-policy/sim-cf-origin-request-policy.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimCloudFrontOriginRequestPolicyCfnProperties {
  readonly policy: SimCloudFrontOriginRequestPolicy;
}

/**
 * CloudFormation-facing behavior for an AWS::CloudFront::OriginRequestPolicy
 * Resource.
 */
export class SimCloudFrontOriginRequestPolicyCfn implements SimCfnResourceValueAdapter {
  private readonly policy: SimCloudFrontOriginRequestPolicy;

  constructor(properties: SimCloudFrontOriginRequestPolicyCfnProperties) {
    this.policy = properties.policy;
  }

  /**
   * CloudFormation Ref for AWS::CloudFront::OriginRequestPolicy returns the
   * policy ID, which is what a Cache Behavior's OriginRequestPolicyId wants.
   */
  refValue(): SimCfnTemplateValue {
    return this.policy.id;
  }

  /**
   * CloudFormation attributes for AWS::CloudFront::OriginRequestPolicy.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    switch (attributeName) {
      case "Id": {
        return this.policy.id;
      }
      default: {
        /* v8 ignore next */
        return `${this.policy.id}.${attributeName}`;
      }
    }
  }
}
