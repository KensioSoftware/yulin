import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import type { SimIamAccountResolver } from "../../../iam/registry/sim-iam-account-resolver.js";
import type { SimIamRoleName } from "../../../iam/role/sim-iam-role.js";
import type { SimIamUsername } from "../../../iam/user/sim-iam-user.js";

/**
 * The unique id STS reports for a caller, which differs by what the caller is.
 *
 * Real STS answers the Account id for the Account root, the user's own id for
 * an IAM user, and the Role's id joined to the session name for an
 * assumed-role session. Each one is looked up rather than invented, so a
 * caller with no simulated record behind it gets no id at all instead of a
 * plausible-looking one.
 */
export function simStsCallerUserId(
  arn: string | undefined,
  accountId: SimAwsAccountId,
  iamResolver: SimIamAccountResolver,
): { UserId?: string } {
  if (arn === undefined) {
    return {};
  }

  const resource = arn.split(":").slice(5).join(":");

  if (resource === "root") {
    return { UserId: accountId };
  }

  const iam = iamResolver.findIamForAccount(accountId);
  if (iam === undefined) {
    return {};
  }

  const [kind, name, sessionName] = resource.split("/", 3);

  if (kind === "user" && name !== undefined) {
    const userId = iam.users.get(name as SimIamUsername)?.userId;

    return userId === undefined ? {} : { UserId: userId };
  }

  if (kind === "assumed-role" && name !== undefined) {
    const roleId = iam.roles.get(name as SimIamRoleName)?.roleId;

    return roleId === undefined
      ? {}
      : { UserId: `${roleId}:${sessionName ?? ""}` };
  }

  return {};
}
