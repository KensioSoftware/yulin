import type { SimCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimIam } from "../../sim-iam.js";
import {
  simCfnIamNameList,
  simCfnIamOptionalString,
} from "../sim-cfn-iam-property.js";

/**
 * Adds Users to a group for AWS::IAM::UserToGroupAddition Resources, and
 * takes them back out when the Resource is deleted.
 */
export class SimCfnIamGroupMembership {
  constructor(private readonly iam: SimIam) {}

  /**
   * Add each User an AWS::IAM::UserToGroupAddition names to its group, or take
   * each back out.
   */
  async membership(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
    request: {
      readonly join: boolean;
      readonly options?: SimCfnResourceCallerOptions | undefined;
    },
  ): Promise<void> {
    const additionType = "AWS::IAM::UserToGroupAddition";
    const GroupName = simCfnIamOptionalString({
      resourceType: additionType,
      resource,
      value: properties["GroupName"],
      label: "GroupName",
    });
    assertDefined(GroupName, `${additionType} ${resource.logicalId} GroupName`);
    const users = simCfnIamNameList({
      resourceType: additionType,
      resource,
      value: properties["Users"],
      label: "Users",
    });

    await Promise.all(
      users.map(async (username) => {
        const input = { input: { GroupName, UserName: username } };

        await (request.join
          ? this.iam.addUserToGroup(input, request.options)
          : this.iam.removeUserFromGroup(input, request.options));
      }),
    );
  }
}
