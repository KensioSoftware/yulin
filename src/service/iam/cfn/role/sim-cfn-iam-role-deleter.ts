import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimIam } from "../../sim-iam.js";
import type { SimIamRole } from "../../role/sim-iam-role.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";

interface SimCfnIamRoleDeleterProperties {
  readonly iam: SimIam;
}

/**
 * Deletes simulated Roles created from AWS::IAM::Role Resources.
 *
 * DeleteRole refuses a Role that still has policies on it, so the Role's
 * policies come off first. Real CloudFormation does the same for the policies
 * it put there itself: a `ManagedPolicyArns` entry is detached and a `Policies`
 * entry removed as part of deleting the Role, rather than being left for the
 * caller to clear up.
 *
 * An AWS::IAM::Policy Resource naming this Role is a separate Resource, and the
 * teardown order takes it off before reaching the Role. Removing whatever is
 * left here covers the policies the Role Resource declared inline.
 */
export class SimCfnIamRoleDeleter {
  private readonly iam: SimIam;

  constructor(properties: SimCfnIamRoleDeleterProperties) {
    this.iam = properties.iam;
  }

  /**
   * Delete the Role a CloudFormation Resource created.
   */
  async delete(resource: SimCfnResource): Promise<void> {
    const role = resource.simResource as SimIamRole | undefined;
    assertDefined(
      role,
      `sim IAM Role for CloudFormation Resource ${resource.logicalId}`,
    );

    await this.detachPolicies(role);
    await this.deleteInlinePolicies(role);

    await this.iam.deleteRole({ input: { RoleName: role.roleName } });
  }

  private async detachPolicies(role: SimIamRole): Promise<void> {
    await Promise.all(
      [...role.attachedPolicyArns].map(async (policyArn) =>
        this.iam.detachRolePolicy({
          input: { RoleName: role.roleName, PolicyArn: policyArn },
        }),
      ),
    );
  }

  private async deleteInlinePolicies(role: SimIamRole): Promise<void> {
    await Promise.all(
      role.inlinePolicies.keys().map(async (policyName) =>
        this.iam.deleteRolePolicy({
          input: { RoleName: role.roleName, PolicyName: policyName },
        }),
      ),
    );
  }
}
