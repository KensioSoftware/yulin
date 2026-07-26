import type { SimLambdaFunctionUrl } from "../../../../lambda/function/url/sim-lambda-function-url.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimLambdaFunctionUrlCfnProperties {
  readonly functionUrl: SimLambdaFunctionUrl;
}

/**
 * CloudFormation-facing behaviour for an AWS::Lambda::Url Resource.
 *
 * The endpoint itself is what templates almost always want from this
 * Resource, through Fn::GetAtt FunctionUrl, which is what CDK's
 * `FunctionUrl.url` resolves to.
 */
export class SimLambdaFunctionUrlCfn implements SimCfnResourceValueAdapter {
  private readonly functionUrl: SimLambdaFunctionUrl;

  constructor(properties: SimLambdaFunctionUrlCfnProperties) {
    this.functionUrl = properties.functionUrl;
  }

  /**
   * CloudFormation Ref for AWS::Lambda::Url returns the endpoint URL.
   */
  refValue(): SimCfnTemplateValue {
    return this.functionUrl.url;
  }

  /**
   * CloudFormation attributes for AWS::Lambda::Url.
   *
   * AWS::Lambda::Url supports Fn::GetAtt for FunctionUrl and FunctionArn.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    if (attributeName === "FunctionUrl") {
      return this.functionUrl.url;
    }

    if (attributeName === "FunctionArn") {
      return this.functionUrl.functionArn;
    }

    return `${this.functionUrl.url}.${attributeName}`;
  }
}
