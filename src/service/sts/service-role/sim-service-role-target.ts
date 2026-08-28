import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import { IamRoleArnParser } from "../../iam/role/arn/sim-iam-role-arn-parser.js";

/**
 * Which IAM a role ARN belongs to, and what the role is called there.
 */
export interface SimServiceRoleTarget {
  readonly accountId: SimAwsAccountId;
  readonly roleName: string;
  readonly roleArn: string;
}

/**
 * Read the Account and name out of a role ARN a service will assume.
 *
 * The ARN is checked for being a role ARN where the request that carried it was
 * written, so this is reading a known shape rather than validating an unknown
 * one.
 */
export function simServiceRoleTarget(roleArn: string): SimServiceRoleTarget {
  const parts = new IamRoleArnParser().parse(roleArn);

  return { accountId: parts.accountId, roleName: parts.roleName, roleArn };
}

/**
 * The caller one assumed service-role session makes.
 *
 * It carries both principals. The request is attributed to the session, as it
 * is on AWS, while the policies that apply are the role's. That is exactly the
 * split `SimResolvedCaller` exists for.
 */
export function simServiceRoleCaller(
  target: SimServiceRoleTarget,
  sessionName: string,
): SimAwsCaller {
  const session = `arn:aws:sts::${target.accountId}:assumed-role/${target.roleName}/${sessionName}`;

  return {
    kind: "resolved",
    principal: { kind: "arn", arn: session },
    identityPolicyPrincipal: { kind: "arn", arn: target.roleArn },
  };
}
