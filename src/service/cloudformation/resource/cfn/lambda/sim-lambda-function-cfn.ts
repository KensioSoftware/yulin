import type { SimLambdaFunction } from "../../../../lambda/function/sim-lambda-function.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimLambdaFunctionCfnProperties {
  readonly lambdaFunction: SimLambdaFunction;
}

/**
 * CloudFormation-facing behaviour for an AWS::Lambda::Function Resource.
 *
 * Keeps Lambda function objects free of CloudFormation intrinsic-function
 * concerns while exposing the correct Ref and Fn::GetAtt values.
 */
export class SimLambdaFunctionCfn implements SimCfnResourceValueAdapter {
  private readonly lambdaFunction: SimLambdaFunction;

  constructor(properties: SimLambdaFunctionCfnProperties) {
    this.lambdaFunction = properties.lambdaFunction;
  }

  /**
   * CloudFormation Ref for AWS::Lambda::Function returns the function name.
   */
  refValue(): SimCfnTemplateValue {
    return this.lambdaFunction.name;
  }

  /**
   * CloudFormation attributes for AWS::Lambda::Function.
   *
   * AWS::Lambda::Function supports Fn::GetAtt for Arn.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    if (attributeName === "Arn") {
      return this.lambdaFunction.arn;
    }

    return `${this.lambdaFunction.arn}.${attributeName}`;
  }
}
