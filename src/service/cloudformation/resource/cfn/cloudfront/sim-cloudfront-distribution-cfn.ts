import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCloudFrontDistribution } from "../../../../cloudfront/distribution/sim-cloudfront-distribution.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimCloudFrontDistributionCfnProperties {
  readonly distro: SimCloudFrontDistribution;
}

/**
 * CloudFormation-facing behavior for an AWS::CloudFront::Distribution Resource.
 */
export class SimCloudFrontDistributionCfn implements SimCfnResourceValueAdapter {
  private readonly distro: SimCloudFrontDistribution;

  constructor(properties: SimCloudFrontDistributionCfnProperties) {
    this.distro = properties.distro;
  }

  /**
   * CloudFormation Ref for AWS::CloudFront::Distribution returns the Distribution ID.
   */
  refValue(): SimCfnTemplateValue {
    return this.distro.distributionId;
  }

  /**
   * CloudFormation attributes for AWS::CloudFront::Distribution.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    switch (attributeName) {
      case "DomainName": {
        return `${this.distro.distributionId.toLowerCase()}.cloudfront.net`;
      }
      case "Id": {
        return this.distro.distributionId;
      }
      default: {
        return `${this.distro.distributionId}.${attributeName}`;
      }
    }
  }
}
