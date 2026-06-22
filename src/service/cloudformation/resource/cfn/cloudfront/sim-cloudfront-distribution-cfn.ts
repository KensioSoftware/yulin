import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCloudFrontDistribution } from "../../../../cloudfront/distribution/sim-cloudfront-distribution.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimCloudFrontDistributionCfnProps {
  readonly distribution: SimCloudFrontDistribution;
}

/**
 * CloudFormation-facing behavior for an AWS::CloudFront::Distribution Resource.
 */
export class SimCloudFrontDistributionCfn implements SimCfnResourceValueAdapter {
  constructor(private readonly props: SimCloudFrontDistributionCfnProps) {}

  /**
   * CloudFormation Ref for AWS::CloudFront::Distribution returns the Distribution ID.
   */
  refValue(): SimCfnTemplateValue {
    return this.props.distribution.distributionId;
  }

  /**
   * CloudFormation attributes for AWS::CloudFront::Distribution.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    switch (attributeName) {
      case "DomainName": {
        return `${this.props.distribution.distributionId.toLowerCase()}.cloudfront.net`;
      }
      case "Id": {
        return this.props.distribution.distributionId;
      }
      default: {
        return `${this.props.distribution.distributionId}.${attributeName}`;
      }
    }
  }
}
