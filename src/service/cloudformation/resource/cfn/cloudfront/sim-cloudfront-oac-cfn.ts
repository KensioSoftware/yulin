import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCloudFrontOriginAccessControl } from "../../../../cloudfront/origin-access-control/sim-cf-origin-access-control.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimCloudFrontOriginAccessControlCfnProperties {
  readonly originAccessControl: SimCloudFrontOriginAccessControl;
}

/**
 * CloudFormation-facing behavior for an AWS::CloudFront::OriginAccessControl
 * Resource.
 */
export class SimCloudFrontOriginAccessControlCfn implements SimCfnResourceValueAdapter {
  private readonly originAccessControl: SimCloudFrontOriginAccessControl;

  constructor(properties: SimCloudFrontOriginAccessControlCfnProperties) {
    this.originAccessControl = properties.originAccessControl;
  }

  /**
   * CloudFormation Ref for AWS::CloudFront::OriginAccessControl returns the ID,
   * which is what an Origin's OriginAccessControlId wants.
   */
  refValue(): SimCfnTemplateValue {
    return this.originAccessControl.id;
  }

  /**
   * CloudFormation attributes for AWS::CloudFront::OriginAccessControl.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    switch (attributeName) {
      case "Id": {
        return this.originAccessControl.id;
      }
      default: {
        /* v8 ignore next */
        return `${this.originAccessControl.id}.${attributeName}`;
      }
    }
  }
}
