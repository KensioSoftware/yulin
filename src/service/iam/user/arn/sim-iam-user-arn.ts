import type { SimArn } from "../../../aws/arn.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import type { SimIamUsername } from "../sim-iam-user.js";

interface MakeSimUserArnProps {
  readonly accountId: SimAwsAccountId;
  readonly path: string;
  readonly userName: SimIamUsername;
}

/**
 * Make an IAM user ARN.
 */
export function makeSimUserArn(props: MakeSimUserArnProps): SimArn {
  const pathPart = props.path === "/" ? "" : props.path.slice(1);

  return `arn:aws:iam::${props.accountId}:user/${pathPart}${props.userName}` as SimArn;
}
