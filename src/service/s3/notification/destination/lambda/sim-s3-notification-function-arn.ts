import type { SimAwsAccountId } from "../../../../aws/sim-aws-account.js";
import type { AwsRegionName } from "../../../../aws/sim-aws-region.js";
import {
  SimS3InvalidArgument,
  SimS3NotImplemented,
} from "../../../error/sim-s3.error.js";

/**
 * The Lambda function ARN a notification configuration names.
 *
 * Lambda addresses a function with colons rather than a slash, so this reads
 * the ARN itself rather than going through the shared ARN parser, which is
 * built for the slash form.
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
    const [
      prefix,
      partition,
      service,
      region,
      accountId,
      resourceType,
      name,
      qualifier,
    ] = arn.split(":");

    if (
      prefix !== "arn" ||
      partition !== "aws" ||
      service !== "lambda" ||
      resourceType !== "function" ||
      region === undefined ||
      accountId === undefined ||
      name === undefined ||
      name === ""
    ) {
      throw new SimS3InvalidArgument(`${arn} is not a Lambda function ARN.`);
    }

    if (qualifier !== undefined) {
      throw new SimS3NotImplemented(
        `Cannot notify ${arn}: simulated Lambda has no function versions or ` +
          "aliases, so a qualified function ARN is refused rather than " +
          "treated as the unqualified function.",
      );
    }

    return new SimS3NotificationFunctionArn(
      region as AwsRegionName,
      accountId as SimAwsAccountId,
      name,
    );
  }
}
