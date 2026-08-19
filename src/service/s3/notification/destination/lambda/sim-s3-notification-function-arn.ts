import type { SimAwsAccountId } from "../../../../aws/sim-aws-account.js";
import type { AwsRegionName } from "../../../../aws/sim-aws-region.js";
import { parseSimLambdaFunctionArn } from "../../../../lambda/function/sim-lambda-function-arn-parts.js";
import { SimS3InvalidArgument } from "../../../error/sim-s3.error.js";

/**
 * The Lambda function ARN a notification configuration names.
 *
 * Reading the ARN is Lambda's own business, so the parts come from there. What
 * S3 adds is what an unreadable one means to a Bucket, which is an
 * `InvalidArgument` against the configuration that named it.
 */
export class SimS3NotificationFunctionArn {
  public readonly regionName: AwsRegionName;
  public readonly accountId: SimAwsAccountId;
  public readonly functionName: string;

  /**
   * The version or alias the ARN qualified the function with, if it named one.
   *
   * A qualified ARN notifies the version it names rather than the function, so
   * the qualifier is held here and resolved when the notification is
   * configured and again when an event is delivered.
   */
  public readonly qualifier: string | undefined;

  private constructor(
    regionName: AwsRegionName,
    accountId: SimAwsAccountId,
    functionName: string,
    qualifier: string | undefined,
  ) {
    this.regionName = regionName;
    this.accountId = accountId;
    this.functionName = functionName;
    this.qualifier = qualifier;
  }

  /**
   * Read a Lambda function ARN, refusing anything else.
   */
  static parse(arn: string): SimS3NotificationFunctionArn {
    const parts = parseSimLambdaFunctionArn(arn);

    if (parts === undefined) {
      throw new SimS3InvalidArgument(`${arn} is not a Lambda function ARN.`);
    }

    return new SimS3NotificationFunctionArn(
      parts.regionName,
      parts.accountId,
      parts.functionName,
      parts.qualifier,
    );
  }
}
