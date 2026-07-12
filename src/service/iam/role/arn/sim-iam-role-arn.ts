import type { SimArn } from "../../../aws/arn.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import type { SimIamRoleName } from "../sim-iam-role.js";

interface MakeSimRoleArnProps {
  readonly accountId: SimAwsAccountId;
  readonly path: string;
  readonly roleName: SimIamRoleName;
}

/**
 * Make an IAM Role ARN.
 */
export function makeSimRoleArn(props: MakeSimRoleArnProps): SimArn {
  const { accountId, path, roleName } = props;
  const pathPart = path === "/" ? "" : path.slice(1);

  return `arn:aws:iam::${accountId}:role/${pathPart}${roleName}` as SimArn;
}
