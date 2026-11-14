import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimIam } from "../../sim-iam.js";
import type { SimIamUser } from "../../user/sim-iam-user.js";
import { simCfnIamHolderSnapshot } from "../sim-cfn-iam-holder-snapshot.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";

interface SimCfnIamUserDeleterProperties {
  readonly iam: SimIam;
}

/**
 * Deletes simulated Users created from AWS::IAM::User Resources.
 *
 * DeleteUser refuses a User that still has policies, a login profile or a
 * group membership, so those come off first. Real CloudFormation does the same
 * for the ones it put there itself: a `ManagedPolicyArns` entry is detached, a
 * `Policies` entry removed, the `LoginProfile` deleted and the User taken out
 * of its `Groups` as part of deleting the User.
 *
 * Each comes off through its own IAM command, authorized for the caller the
 * Stack is deleted as. Where a command or the DeleteUser is refused, the User
 * is put back as the Stack deployed it. An access key created outside the
 * Stack refuses the deletion, as it does in AWS.
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

    const username = user.userName;
    const { loginProfile } = user;
    const restore = simCfnIamHolderSnapshot(user);

    try {
      await Promise.all([
        ...user.attachedPolicyArns
          .values()
          .map(async (PolicyArn) =>
            this.iam.detachUserPolicy(
              { input: { UserName: username, PolicyArn } },
              options,
            ),
          ),
        ...user.inlinePolicies
          .keys()
          .map(async (PolicyName) =>
            this.iam.deleteUserPolicy(
              { input: { UserName: username, PolicyName } },
              options,
            ),
          ),
        ...user.groups
          .keys()
          .map(async (GroupName) =>
            this.iam.removeUserFromGroup(
              { input: { GroupName, UserName: username } },
              options,
            ),
          ),
        ...[loginProfile]
          .filter(Boolean)
          .map(async () =>
            this.iam.deleteLoginProfile(
              { input: { UserName: username } },
              options,
            ),
          ),
      ]);
      await this.iam.deleteUser({ input: { UserName: username } }, options);
    } catch (error) {
      restore();
      user.loginProfile = loginProfile;

      throw error;
    }
  }
}
