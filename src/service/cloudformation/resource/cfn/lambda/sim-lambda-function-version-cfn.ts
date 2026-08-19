import type { SimLambdaFunction } from "../../../../lambda/function/sim-lambda-function.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimLambdaFunctionVersionCfnProperties {
  readonly version: SimLambdaFunction;
}

/**
 * CloudFormation-facing behaviour for an AWS::Lambda::Version Resource.
 *
 * A version is a function under a number, so the same simulated function
 * object backs this Resource and AWS::Lambda::Function. What differs is what
 * templates want from it: the ARN with the number on the end, which is what a
 * later alias or integration has to be pointed at to reach this version rather
 * than `$LATEST`.
 */
export class SimLambdaFunctionVersionCfn implements SimCfnResourceValueAdapter {
  private readonly version: SimLambdaFunction;

  constructor(properties: SimLambdaFunctionVersionCfnProperties) {
    this.version = properties.version;
  }

  /**
   * CloudFormation Ref for AWS::Lambda::Version returns the qualified function
   * ARN, which is the function's own ARN with the version number appended.
   */
  refValue(): SimCfnTemplateValue {
    return this.version.arn;
  }

  /**
   * CloudFormation attributes for AWS::Lambda::Version.
   *
   * `Version` is the number the function was published under, which is what an
   * alias's FunctionVersion is written from. `FunctionArn` is what
   * PublishVersion answers with, so it names the version rather than the
   * function.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    if (attributeName === "Version") {
      return this.version.version;
    }

    if (attributeName === "FunctionArn") {
      return this.version.arn;
    }

    throw new Error(
      `Unsupported AWS::Lambda::Version attribute ${attributeName}`,
    );
  }
}
