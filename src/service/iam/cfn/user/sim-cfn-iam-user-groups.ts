import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { maxSimIamGroupsPerUser } from "../../command/group/sim-iam-group-membership-commands.js";
import { simIamRefuseWhen } from "../../command/sim-iam-found.js";
import { simCfnIamNameList } from "../sim-cfn-iam-property.js";

const resourceType = "AWS::IAM::User";

/**
 * The groups an AWS::IAM::User joins as it is created.
 *
 * More than IAM lets one User be in fails the Resource before the User is
 * created, where joining the eleventh would leave the User behind.
 */
export function simCfnIamUserGroups(
  resource: SimCfnResource,
  properties: SimCfnTemplateValueRecord,
): readonly string[] {
  const groups = simCfnIamNameList({
    resourceType,
    resource,
    value: properties["Groups"],
    label: "Groups",
  });

  simIamRefuseWhen(
    groups.length > maxSimIamGroupsPerUser,
    () =>
      new TypeError(
        `Invalid ${resourceType} ${resource.logicalId}: Groups names more ` +
          `than ${String(maxSimIamGroupsPerUser)} groups`,
      ),
  );

  return groups;
}
