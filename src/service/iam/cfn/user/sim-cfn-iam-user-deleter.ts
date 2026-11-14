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
 * DeleteUser refuses a User that still has policies, a login profile or a
 * group membership, so those come off first. Real CloudFormation does the same
 * for the ones it put there itself: a `ManagedPolicyArns` entry is detached, a
 * `Policies` entry removed, the `LoginProfile` deleted and the User taken out
 * of its `Groups` as part of deleting the User.
 *
 * They come off the User record together, and a DeleteUser the caller is not
 * allowed puts them all back, leaving the User as the Stack deployed it. An
 * access key the Stack did not create still refuses the deletion, as it does
 * in AWS.
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

    const attachedPolicyArns = [...user.attachedPolicyArns];
    const inlinePolicies = [...user.inlinePolicies];
    const groups = [...user.groups];
    const { loginProfile } = user;

    user.attachedPolicyArns.clear();
    user.inlinePolicies.clear();
    user.groups.clear();
    user.loginProfile = undefined;

    try {
      await this.iam.deleteUser(
        { input: { UserName: user.userName } },
        options,
      );
    } catch (error) {
      for (const policyArn of attachedPolicyArns) {
        user.attachedPolicyArns.add(policyArn);
      }

      for (const [policyName, document] of inlinePolicies) {
        user.inlinePolicies.set(policyName, document);
      }

      for (const [groupName, group] of groups) {
        user.groups.set(groupName, group);
      }

      user.loginProfile = loginProfile;

      throw error;
    }
  }
}
