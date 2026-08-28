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
 * User record here rather than through a command. A DeleteUser the caller is
 * not allowed puts them back, leaving the User as the Stack deployed it.
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

    user.attachedPolicyArns.clear();
    user.inlinePolicies.clear();

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

      throw error;
    }
  }
}
