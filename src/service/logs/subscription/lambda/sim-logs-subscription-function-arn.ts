import type { SimAwsAccountId } from "../../../aws/sim-aws-account-id.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
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
  readonly qualifier: string | undefined;
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

  /**
   * The version or alias the destination qualified the function with, if it
   * named one.
   *
   * A filter whose destination is `orders:live` delivers to the version the
   * alias points at, so the qualifier is held here and resolved when the
   * filter is put and again on every delivery.
   */
  readonly qualifier: string | undefined;

  private constructor(properties: SimLogsSubscriptionFunctionArnProperties) {
    this.value = properties.value;
    this.regionName = properties.regionName;
    this.accountId = properties.accountId;
    this.functionName = properties.functionName;
    this.qualifier = properties.qualifier;
  }

  /**
   * Read a destination ARN, refusing one no simulated function is behind.
   *
   * Only a Lambda destination is simulated. Kinesis and Firehose are real
   * CloudWatch Logs destinations refused here rather than accepted and never
   * delivered to, since a subscription that takes the configuration and
   * quietly drops every event is the hardest kind of thing to find.
   *
   * A function outside the filter's own Account and Region is refused too, and
   * that one is real AWS behaviour rather than a gap: CloudWatch Logs takes a
   * Lambda destination "belonging to the same account as the subscription
   * filter", and reaches another Account only through a logical destination,
   * which is a Kinesis stream. Accepting one here would let a test wire up
   * something an account would reject.
   */
  static parse(
    destinationArn: string,
    scope: SimAwsAccountRegionScope,
  ): SimLogsSubscriptionFunctionArn {
    const parts = parseSimLambdaFunctionArn(destinationArn);

    if (parts === undefined) {
      throw new SimLogsUnsupportedOperationException(
        `${destinationArn} is not a Lambda function ARN. Only a Lambda ` +
          `destination is simulated, which is ` +
          `arn:aws:lambda:<region>:<account-id>:function:<function-name>`,
      );
    }

    if (parts.accountId !== scope.accountId) {
      throw new SimLogsInvalidParameterException(
        `${destinationArn} is in Account ${parts.accountId}, and a Lambda ` +
          `destination has to belong to the same Account as the subscription ` +
          `filter, which is ${scope.accountId}. Real CloudWatch Logs reaches ` +
          `another Account through a logical destination instead.`,
      );
    }

    if (parts.regionName !== scope.regionName) {
      throw new SimLogsInvalidParameterException(
        `${destinationArn} is in Region ${parts.regionName}, and a Lambda ` +
          `destination has to be in the same Region as the log group, which ` +
          `is in ${scope.regionName}.`,
      );
    }

    return new SimLogsSubscriptionFunctionArn({
      value: destinationArn,
      regionName: parts.regionName,
      accountId: parts.accountId,
      functionName: parts.functionName,
      qualifier: parts.qualifier,
    });
  }
}
