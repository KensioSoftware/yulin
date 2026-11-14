import {
  SimIamLimitExceeded,
  SimIamNoSuchEntity,
} from "../../error/sim-iam.error.js";
import type { SimIamGroup } from "../../group/sim-iam-group.js";
import type { SimIamUser } from "../../user/sim-iam-user.js";
import type { SimIamEmptyOutput } from "../entity/sim-iam-entity-policy.command.js";
import type { SimIamRequestOptions } from "../sim-iam-request-options.js";
import type { SimIamGroupLookup } from "./sim-iam-group-lookup.js";
import type { SimGroupMembershipCommand } from "./sim-iam-group.command.js";

/**
 * The most groups IAM lets one User be in.
 */
export const maxSimIamGroupsPerUser = 10;

/**
 * The commands that add a User to a group and take it out.
 *
 * A User in a group gets the group's policies as well as its own, from its
 * next request on. Both commands are authorized on the group.
 */
export class SimIamGroupMembershipCommands {
  constructor(private readonly lookup: SimIamGroupLookup) {}

  /**
   * Add a User to a group. Adding a User already in it changes nothing.
   */
  async addUserToGroup(
    command: SimGroupMembershipCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimIamEmptyOutput> {
    await this.lookup.sequence();
    const { group, user } = this.membership("AddUserToGroup", command, options);

    if (
      !user.groups.has(group.groupName) &&
      user.groups.size >= maxSimIamGroupsPerUser
    ) {
      throw new SimIamLimitExceeded(
        `Cannot exceed quota for GroupsPerUser: ${String(maxSimIamGroupsPerUser)}`,
      );
    }

    user.groups.set(group.groupName, group);

    return {};
  }

  /**
   * Take a User out of a group.
   */
  async removeUserFromGroup(
    command: SimGroupMembershipCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimIamEmptyOutput> {
    await this.lookup.sequence();
    const { group, user } = this.membership(
      "RemoveUserFromGroup",
      command,
      options,
    );

    if (!user.groups.delete(group.groupName)) {
      throw new SimIamNoSuchEntity(
        `User ${user.userName} is not in group ${group.groupName}.`,
      );
    }

    return {};
  }

  private membership(
    action: string,
    command: SimGroupMembershipCommand,
    options: SimIamRequestOptions | undefined,
  ): { readonly group: SimIamGroup; readonly user: SimIamUser } {
    const group = this.lookup.group(action, command.input.GroupName, options);

    return { group, user: this.lookup.existingUser(command.input.UserName) };
  }
}
