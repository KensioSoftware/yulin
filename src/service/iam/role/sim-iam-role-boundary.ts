import type { SimIamConditionValue } from "../policy/sim-iam-policy.js";
import type { SimArn } from "../../aws/arn.js";
import type { SimIamRole } from "./sim-iam-role.js";

/**
 * A permissions boundary attached to a Role, as IAM describes one.
 *
 * IAM answers with the attachment rather than the bare ARN, and the type has
 * only ever taken one value.
 */
export interface SimIamAttachedPermissionsBoundary {
  readonly PermissionsBoundaryType: "PermissionsBoundaryPolicy";
  readonly PermissionsBoundaryArn: SimArn;
}

/**
 * The member names IAM describes an attached boundary with.
 */
export const simIamAttachedBoundaryMembers = [
  "PermissionsBoundaryType",
  "PermissionsBoundaryArn",
];

/**
 * How a Role's boundary appears in a CreateRole or GetRole answer.
 *
 * A Role created without one has no attachment to describe, and IAM leaves
 * the field out. `ListRoles` leaves it out whatever the Role carries, along
 * with the Role's tags and last use, and points the caller at `GetRole`.
 */
export function simIamAttachedPermissionsBoundary(
  role: SimIamRole,
): SimIamAttachedPermissionsBoundary | undefined {
  const permissionsBoundaryArn = role.permissionsBoundaryArn;

  if (permissionsBoundaryArn === undefined) {
    return undefined;
  }

  return {
    PermissionsBoundaryType: "PermissionsBoundaryPolicy",
    PermissionsBoundaryArn: permissionsBoundaryArn,
  };
}

/**
 * What a Role-creating request says about the boundary it declares.
 *
 * An account that requires a permissions boundary allows `iam:CreateRole`
 * only under `StringEquals` on `iam:PermissionsBoundary`, and the CDK
 * permissions-boundary guard is written that way. A request declaring no
 * boundary leaves the key out, which is what refuses it: a positive operator
 * over an absent key matches nothing.
 */
export function simIamPermissionsBoundaryCondition(
  permissionsBoundary: string | undefined,
): Readonly<Record<string, SimIamConditionValue>> | undefined {
  return permissionsBoundary === undefined
    ? undefined
    : { "iam:PermissionsBoundary": permissionsBoundary };
}
