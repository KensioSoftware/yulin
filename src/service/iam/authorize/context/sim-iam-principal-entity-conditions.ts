import type { SimIamConditionValue } from "../../policy/sim-iam-policy.js";
import type { SimIamRole, SimIamRoleName } from "../../role/sim-iam-role.js";
import type { SimIamUser, SimIamUsername } from "../../user/sim-iam-user.js";

type SimIamConditions = Readonly<Record<string, SimIamConditionValue>>;

/**
 * The Roles and Users of one Account.
 */
export interface SimIamPrincipalDirectory {
  readonly roles: ReadonlyMap<SimIamRoleName, SimIamRole>;
  readonly users: ReadonlyMap<SimIamUsername, SimIamUser>;
}

/**
 * Describe an IAM User calling.
 */
export function simIamUserConditions(
  directory: SimIamPrincipalDirectory | undefined,
  username: string | undefined,
): SimIamConditions {
  const user = directory?.users.get(username as SimIamUsername);

  if (user === undefined) {
    return { "aws:PrincipalType": "User" };
  }

  return {
    "aws:PrincipalType": "User",
    "aws:userid": user.userId,
    "aws:username": user.userName,
    ...user.tags.conditionValues("aws:PrincipalTag/"),
  };
}

/**
 * Describe a session of a Role calling.
 */
export function simIamRoleSessionConditions(
  directory: SimIamPrincipalDirectory | undefined,
  roleName: string | undefined,
  sessionName?: string,
): SimIamConditions {
  const role = directory?.roles.get(roleName as SimIamRoleName);

  if (role === undefined) {
    return { "aws:PrincipalType": "AssumedRole" };
  }

  return {
    "aws:PrincipalType": "AssumedRole",
    ...(sessionName !== undefined && {
      "aws:userid": `${role.roleId}:${sessionName}`,
    }),
    ...role.tags.conditionValues("aws:PrincipalTag/"),
  };
}
