import type { SimCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";
import type { SimIam } from "../../sim-iam.js";

/**
 * The instance profile a template creates, and the Roles it names for it.
 */
interface SimCfnIamProfileRoles {
  readonly InstanceProfileName: string;
  readonly roles: readonly string[];
}

/**
 * Put the Roles a template names into the instance profile it has just
 * created. A Role IAM refuses to add, such as one that is absent, takes the
 * profile with it, so nothing is left holding the name.
 */
export async function simCfnIamFillInstanceProfile(
  iam: SimIam,
  profile: SimCfnIamProfileRoles,
  options?: SimCfnResourceCallerOptions,
): Promise<void> {
  const { InstanceProfileName, roles } = profile;

  try {
    await Promise.all(
      roles.map(async (RoleName) =>
        iam.addRoleToInstanceProfile(
          { input: { InstanceProfileName, RoleName } },
          options,
        ),
      ),
    );
  } catch (error) {
    await iam.deleteInstanceProfile(
      { input: { InstanceProfileName } },
      options,
    );
    throw error;
  }
}
