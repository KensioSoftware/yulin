import type { SimLambdaFunctionAlias } from "../../../../lambda/function/version/sim-lambda-function-alias.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimLambdaFunctionAliasCfnProperties {
  readonly alias: SimLambdaFunctionAlias;
}

/**
 * CloudFormation-facing behaviour for an AWS::Lambda::Alias Resource.
 *
 * The alias ARN is what the rest of a template interpolates, and CDK reads the
 * alias name back out of it, so the ARN carries the name on the end rather
 * than standing for the function.
 */
export class SimLambdaFunctionAliasCfn implements SimCfnResourceValueAdapter {
  private readonly alias: SimLambdaFunctionAlias;

  constructor(properties: SimLambdaFunctionAliasCfnProperties) {
    this.alias = properties.alias;
  }

  /**
   * CloudFormation Ref for AWS::Lambda::Alias returns the alias ARN.
   */
  refValue(): SimCfnTemplateValue {
    return this.alias.arn;
  }

  /**
   * CloudFormation attributes for AWS::Lambda::Alias.
   *
   * AWS::Lambda::Alias supports Fn::GetAtt for AliasArn.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    if (attributeName === "AliasArn") {
      return this.alias.arn;
    }

    throw new Error(
      `Unsupported AWS::Lambda::Alias attribute ${attributeName}`,
    );
  }
}
