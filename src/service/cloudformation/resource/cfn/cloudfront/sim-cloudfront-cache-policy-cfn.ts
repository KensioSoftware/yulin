import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCloudFrontCachePolicy } from "../../../../cloudfront/cache-policy/sim-cf-cache-policy.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimCloudFrontCachePolicyCfnProperties {
  readonly policy: SimCloudFrontCachePolicy;
}

/**
 * CloudFormation-facing behavior for an AWS::CloudFront::CachePolicy Resource.
 */
export class SimCloudFrontCachePolicyCfn implements SimCfnResourceValueAdapter {
  private readonly policy: SimCloudFrontCachePolicy;

  constructor(properties: SimCloudFrontCachePolicyCfnProperties) {
    this.policy = properties.policy;
  }

  /**
   * CloudFormation Ref for AWS::CloudFront::CachePolicy returns the policy ID,
   * which is what a Cache Behavior's CachePolicyId wants.
   */
  refValue(): SimCfnTemplateValue {
    return this.policy.id;
  }

  /**
   * CloudFormation attributes for AWS::CloudFront::CachePolicy.
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
