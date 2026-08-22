import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimArn } from "../../aws/arn.js";
import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import type { SimCloudFrontFunctionName } from "./sim-cloudfront-function.js";

/**
 * The Function name a CloudFront Function ARN carries, when the ARN belongs to
 * this Account.
 *
 * A CloudFront Function is a global resource, so its ARN carries an Account
 * and no Region. One naming another Account belongs to another simulated
 * CloudFront and answers with nothing here.
 */
export function simCffNameInArn(
  cloudFrontFunctionArn: SimArn,
  accountId: SimAwsAccountId,
): SimCloudFrontFunctionName | undefined {
  if (cloudFrontFunctionArn.split(":", 5)[4] !== accountId) {
    return undefined;
  }

  const cloudFrontFunctionName = cloudFrontFunctionArn.split("/").pop();

  assertDefined(
    cloudFrontFunctionName,
    `CloudFront Function name in ARN ${cloudFrontFunctionArn}`,
  );

  return cloudFrontFunctionName as SimCloudFrontFunctionName;
}
