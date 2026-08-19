import type { SimAwsAccountId } from "../../aws/sim-aws-account-id.js";
import type { AwsRegionName } from "../../aws/sim-aws-region.js";
import { parseSimLambdaFunctionArn } from "../../lambda/function/sim-lambda-function-arn-parts.js";
import { SimSnsInvalidParameterException } from "../error/sim-sns.error.js";

interface SimSnsFunctionEndpointArnProperties {
  readonly value: string;
  readonly regionName: AwsRegionName;
  readonly accountId: SimAwsAccountId;
  readonly functionName: string;
  readonly qualifier: string | undefined;
}

/**
 * The Lambda function ARN a subscription's endpoint names.
 *
 * The Region and the Account are read out alongside the name, because a
 * delivery resolves the function in the scope the ARN gives rather than in the
 * topic's. Real SNS invokes a function in another Account or Region, so this
 * does too.
 */
export class SimSnsFunctionEndpointArn {
  public readonly value: string;
  public readonly regionName: AwsRegionName;
  public readonly accountId: SimAwsAccountId;
  public readonly functionName: string;

  /**
   * The version or alias the endpoint qualified the function with, if it named
   * one.
   *
   * A subscription to `orders:live` delivers to the version the alias points
   * at, so the qualifier is held here and resolved on every delivery.
   */
  public readonly qualifier: string | undefined;

  private constructor(properties: SimSnsFunctionEndpointArnProperties) {
    this.value = properties.value;
    this.regionName = properties.regionName;
    this.accountId = properties.accountId;
    this.functionName = properties.functionName;
    this.qualifier = properties.qualifier;
  }

  /**
   * Read a function ARN, refusing anything a function could not be reached by.
   *
   * Reading the ARN is Lambda's own business, so the parts come from there.
   * What SNS adds is what an unreadable one means to a `Subscribe` request,
   * which is the same `InvalidParameterException` a queue ARN that is not one
   * gets.
   */
  static parse(endpoint: string): SimSnsFunctionEndpointArn {
    const parts = parseSimLambdaFunctionArn(endpoint);

    if (parts === undefined) {
      throw new SimSnsInvalidParameterException(
        `Invalid parameter: Endpoint Reason: ${endpoint} is not a Lambda ` +
          "function ARN, which is " +
          "arn:aws:lambda:<region>:<account-id>:function:<function-name>",
      );
    }

    return new this({
      value: endpoint,
      regionName: parts.regionName,
      accountId: parts.accountId,
      functionName: parts.functionName,
      qualifier: parts.qualifier,
    });
  }
}
