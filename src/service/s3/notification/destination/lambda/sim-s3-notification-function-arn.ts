import type { SimAwsAccountId } from "../../../../aws/sim-aws-account.js";
import type { AwsRegionName } from "../../../../aws/sim-aws-region.js";
import { parseSimLambdaFunctionArn } from "../../../../lambda/function/sim-lambda-function-arn-parts.js";
import {
  SimS3InvalidArgument,
  SimS3NotImplemented,
} from "../../../error/sim-s3.error.js";

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

  private constructor(
    regionName: AwsRegionName,
    accountId: SimAwsAccountId,
    functionName: string,
  ) {
    this.regionName = regionName;
    this.accountId = accountId;
    this.functionName = functionName;
  }

  /**
   * Read a Lambda function ARN, refusing anything else.
   *
   * A qualified ARN naming a version or an alias is refused rather than being
   * read as the unqualified function, because simulated Lambda has neither and
   * silently notifying `$LATEST` instead would be the wrong function.
   */
  static parse(arn: string): SimS3NotificationFunctionArn {
    const parts = parseSimLambdaFunctionArn(arn);

    if (parts === undefined) {
      throw new SimS3InvalidArgument(`${arn} is not a Lambda function ARN.`);
    }

    if (parts.qualifier !== undefined) {
      throw new SimS3NotImplemented(
        `Cannot notify ${arn}: simulated Lambda has no function versions or ` +
          "aliases, so a qualified function ARN is refused rather than " +
          "treated as the unqualified function.",
      );
    }

    return new SimS3NotificationFunctionArn(
      parts.regionName,
      parts.accountId,
      parts.functionName,
    );
  }
}
