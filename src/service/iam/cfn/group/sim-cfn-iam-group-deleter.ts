import type { SimCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimIamGroup } from "../../group/sim-iam-group.js";
import type { SimIam } from "../../sim-iam.js";
import { simCfnIamHolderSnapshot } from "../sim-cfn-iam-holder-snapshot.js";

/**
 * Deletes simulated IAM groups created from AWS::IAM::Group Resources.
 */
export class SimCfnIamGroupDeleter {
  constructor(private readonly iam: SimIam) {}

  /**
   * Delete a group, taking off the policies the Stack gave it first. Where
   * the deletion is refused, such as for a group a User outside the Stack is
   * still in, the group keeps its policies.
   */
  async delete(
    resource: SimCfnResource,
    options?: SimCfnResourceCallerOptions,
  ): Promise<void> {
    const group = resource.simResource as SimIamGroup | undefined;
    assertDefined(
      group,
      `sim IAM group for CloudFormation Resource ${resource.logicalId}`,
    );
    const GroupName = group.groupName;
    const restore = simCfnIamHolderSnapshot(group);

    try {
      await Promise.all([
        ...group.inlinePolicies
          .keys()
          .map(async (PolicyName) =>
            this.iam.deleteGroupPolicy(
              { input: { GroupName, PolicyName } },
              options,
            ),
          ),
        ...group.attachedPolicyArns
          .values()
          .map(async (PolicyArn) =>
            this.iam.detachGroupPolicy(
              { input: { GroupName, PolicyArn } },
              options,
            ),
          ),
      ]);
      await this.iam.deleteGroup({ input: { GroupName } }, options);
    } catch (error) {
      restore();

      throw error;
    }
  }
}
