import type { SimAwsAccountId } from "../../../aws/sim-aws-account-id.js";
import type { AwsRegionName } from "../../../aws/sim-aws-region.js";
import { parseSimLambdaFunctionArn } from "../../../lambda/function/sim-lambda-function-arn-parts.js";
import {
  SimLogsInvalidParameterException,
  SimLogsUnsupportedOperationException,
} from "../../error/sim-logs.error.js";

interface SimLogsSubscriptionFunctionArnProperties {
  readonly value: string;
  readonly regionName: AwsRegionName;
  readonly accountId: SimAwsAccountId;
  readonly functionName: string;
}

/**
 * The Lambda function ARN a subscription filter's destination names.
 *
 * The Region and the Account are read out alongside the name so that a
 * delivery resolves the function in the scope its ARN gives.
 */
export class SimLogsSubscriptionFunctionArn {
  readonly value: string;
  readonly regionName: AwsRegionName;
  readonly accountId: SimAwsAccountId;
  readonly functionName: string;

  private constructor(properties: SimLogsSubscriptionFunctionArnProperties) {
    this.value = properties.value;
    this.regionName = properties.regionName;
    this.accountId = properties.accountId;
    this.functionName = properties.functionName;
  }

  /**
   * Read a destination ARN, refusing one no simulated function is behind.
   *
   * Only a Lambda destination is simulated. Kinesis, Firehose and a
   * cross-account destination ARN are all real CloudWatch Logs destinations
   * and are refused here rather than accepted and never delivered to, since a
   * subscription that takes the configuration and quietly drops every event is
   * the hardest kind of thing to find.
   */
  static parse(destinationArn: string): SimLogsSubscriptionFunctionArn {
    const parts = parseSimLambdaFunctionArn(destinationArn);

    if (parts === undefined) {
      throw new SimLogsUnsupportedOperationException(
        `${destinationArn} is not a Lambda function ARN. Only a Lambda ` +
          `destination is simulated, which is ` +
          `arn:aws:lambda:<region>:<account-id>:function:<function-name>`,
      );
    }

    if (parts.qualifier !== undefined) {
      throw new SimLogsInvalidParameterException(
        `${destinationArn} names a function version or alias, and simulated ` +
          `Lambda has neither, so delivering to the unqualified function ` +
          `instead would be delivering to a different one`,
      );
    }

    return new SimLogsSubscriptionFunctionArn({
      value: destinationArn,
      regionName: parts.regionName,
      accountId: parts.accountId,
      functionName: parts.functionName,
    });
  }
}
