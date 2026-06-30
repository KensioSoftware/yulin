import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCloudFrontFunction } from "../../../../cloudfront/cff/sim-cloudfront-function.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimCloudFrontFunctionCfnProps {
  readonly cloudFrontFunction: SimCloudFrontFunction;
}

/**
 * CloudFormation-facing behavior for an AWS::CloudFront::Function Resource.
 */
export class SimCloudFrontFunctionCfn implements SimCfnResourceValueAdapter {
  private readonly cloudFrontFunction;

  constructor(props: SimCloudFrontFunctionCfnProps) {
    this.cloudFrontFunction = props.cloudFrontFunction;
  }

  /**
   * CloudFormation Ref for AWS::CloudFront::Function returns the Function name.
   */
  refValue(): SimCfnTemplateValue {
    return this.cloudFrontFunction.name;
  }

  /**
   * CloudFormation attributes for AWS::CloudFront::Function.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    switch (attributeName) {
      case "FunctionARN":
      case "FunctionMetadata.FunctionARN": {
        return this.cloudFrontFunction.arn;
      }
      default: {
        /* v8 ignore next */
        return `${this.cloudFrontFunction.name}.${attributeName}`;
      }
    }
  }
}
