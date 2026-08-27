import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimIam } from "../../sim-iam.js";
import type { SimIamUser } from "../../user/sim-iam-user.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";

interface SimCfnIamUserDeleterProperties {
  readonly iam: SimIam;
}

/**
 * Deletes simulated Users created from AWS::IAM::User Resources.
 *
 * DeleteUser refuses a User that still has policies on it, the way DeleteRole
 * refuses a Role, so the User's policies come off first. Real CloudFormation
 * does the same for the ones it put there itself: a `ManagedPolicyArns` entry
 * is detached and a `Policies` entry removed as part of deleting the User.
 *
 * Sim IAM serves no DeleteUserPolicy or DetachUserPolicy, so both come off the
 * User record here rather than through a command.
 */
export class SimCfnIamUserDeleter {
  private readonly iam: SimIam;

  constructor(properties: SimCfnIamUserDeleterProperties) {
    this.iam = properties.iam;
  }

  /**
   * Delete the User a CloudFormation Resource created.
   */
  async delete(
    resource: SimCfnResource,
    options?: SimCfnResourceCallerOptions,
  ): Promise<void> {
    const user = resource.simResource as SimIamUser | undefined;
    assertDefined(
      user,
      `sim IAM User for CloudFormation Resource ${resource.logicalId}`,
    );

    user.attachedPolicyArns.clear();
    user.inlinePolicies.clear();

    await this.iam.deleteUser({ input: { UserName: user.userName } }, options);
  }
}
