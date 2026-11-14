import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimIamInstanceProfile } from "../../instance-profile/sim-iam-instance-profile.js";
import type { SimIam } from "../../sim-iam.js";

/**
 * Deletes simulated IAM instance profiles created from
 * AWS::IAM::InstanceProfile Resources.
 */
export class SimCfnIamInstanceProfileDeleter {
  constructor(private readonly iam: SimIam) {}

  /**
   * Take the Role out of an instance profile, then delete the profile.
   */
  async delete(
    resource: SimCfnResource,
    options?: SimCfnResourceCallerOptions,
  ): Promise<void> {
    const profile = resource.simResource as SimIamInstanceProfile | undefined;
    assertDefined(
      profile,
      `sim IAM instance profile for CloudFormation Resource ${resource.logicalId}`,
    );
    const InstanceProfileName = profile.instanceProfileName;

    if (profile.roleName !== undefined) {
      await this.iam.removeRoleFromInstanceProfile(
        { input: { InstanceProfileName, RoleName: profile.roleName } },
        options,
      );
    }

    await this.iam.deleteInstanceProfile(
      { input: { InstanceProfileName } },
      options,
    );
  }
}
