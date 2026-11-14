import type { SimIamRoleName } from "./sim-iam-role.js";

/**
 * The Role name a command gives, refusing one it leaves out or leaves empty.
 */
export function simIamRoleNameInput(
  roleName: string | undefined,
): SimIamRoleName {
  if (roleName === undefined || roleName.length === 0) {
    throw new Error("RoleName is required");
  }

  return roleName as SimIamRoleName;
}
