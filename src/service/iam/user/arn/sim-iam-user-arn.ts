import type { SimArn } from "../../../aws/arn.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import type { SimIamUsername } from "../sim-iam-user.js";

interface MakeSimUserArnProperties {
  readonly accountId: SimAwsAccountId;
  readonly path: string;
  readonly userName: SimIamUsername;
}

/**
 * Make an IAM user ARN.
 */
export function makeSimUserArn(properties: MakeSimUserArnProperties): SimArn {
  const pathPart = properties.path === "/" ? "" : properties.path.slice(1);

  return `arn:aws:iam::${properties.accountId}:user/${pathPart}${properties.userName}`;
}
