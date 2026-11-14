import type { SimArn } from "../../../aws/arn.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import type { SimIamActionAuthorizer } from "../../authorize/sim-iam-action-authorizer.js";
import type { SimIamGroupName } from "../../group/sim-iam-group.js";
import type { SimIamEmptyOutput } from "../entity/sim-iam-entity-policy.command.js";
import type { SimUpdateGroupCommand } from "../entity/sim-iam-entity-update.command.js";
import { simIamRenamed } from "../entity/sim-iam-renamed.js";
import { assertSimIamNameFree } from "../sim-iam-account-quota.js";
import type { SimIamRequestOptions } from "../sim-iam-request-options.js";
import type { SimIamGroupLookup } from "./sim-iam-group-lookup.js";
import { assertSimIamGroupName } from "./sim-iam-group-name.js";

/**
 * The command that renames a group or moves it to another path.
 *
 * The group keeps its ID, policies and Users. A rename needs
 * `iam:UpdateGroup` on the group as it is and as it will be, as IAM asks.
 */
export class SimIamGroupRenameCommands {
  constructor(
    private readonly accountId: SimAwsAccountId,
    private readonly authorizer: SimIamActionAuthorizer,
    private readonly lookup: SimIamGroupLookup,
  ) {}

  /**
   * Rename a group or move it to another path. Its Users stay in it.
   */
  async updateGroup(
    command: SimUpdateGroupCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimIamEmptyOutput> {
    await this.lookup.sequence();
    const { input } = command;
    const { groups } = this.lookup.properties;
    const group = this.lookup.group("UpdateGroup", input.GroupName, options);
    const { name, path } = simIamRenamed(
      { name: group.groupName, path: group.path },
      input.NewGroupName,
      input.NewPath,
    );
    const groupName = name as SimIamGroupName;
    assertSimIamGroupName(groupName);
    const arn = `arn:aws:iam::${this.accountId}:group${path}${name}` as SimArn;
    this.authorizer.authorize("iam:UpdateGroup", arn, options?.caller);
    assertSimIamNameFree(
      groups.keys().filter((each) => each !== group.groupName),
      name,
      `Group with name ${name} already exists.`,
    );

    for (const member of this.lookup.members(group)) {
      member.groups.delete(group.groupName);
      member.groups.set(groupName, group);
    }
    groups.delete(group.groupName);
    Object.assign(group, { arn, groupName, path });
    groups.set(groupName, group);

    return {};
  }
}
