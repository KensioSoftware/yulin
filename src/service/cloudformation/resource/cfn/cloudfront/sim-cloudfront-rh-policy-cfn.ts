import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCloudFrontResponseHeadersPolicy } from "../../../../cloudfront/response-headers-policy/sim-cf-response-headers-policy.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimCloudFrontResponseHeadersPolicyCfnProperties {
  readonly policy: SimCloudFrontResponseHeadersPolicy;
}

/**
 * CloudFormation-facing behavior for an AWS::CloudFront::ResponseHeadersPolicy
 * Resource.
 */
export class SimCloudFrontResponseHeadersPolicyCfn implements SimCfnResourceValueAdapter {
  private readonly policy: SimCloudFrontResponseHeadersPolicy;

  constructor(properties: SimCloudFrontResponseHeadersPolicyCfnProperties) {
    this.policy = properties.policy;
  }

  /**
   * CloudFormation Ref for AWS::CloudFront::ResponseHeadersPolicy returns the
   * policy ID, which is what a Cache Behavior's ResponseHeadersPolicyId wants.
   */
  refValue(): SimCfnTemplateValue {
    return this.policy.id;
  }

  /**
   * CloudFormation attributes for AWS::CloudFront::ResponseHeadersPolicy.
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
