import type { SimIamRequestOptions } from "./command/sim-iam-request-options.js";
import type { SimIamEmptyOutput } from "./command/entity/sim-iam-entity-policy.command.js";
import type * as updates from "./command/entity/sim-iam-entity-update.command.js";
import type * as groups from "./command/group/sim-iam-group.command.js";
import type * as users from "./command/user/sim-iam-user-read.command.js";
import { SimIamPolicyOperations } from "./sim-iam-policy-operations.js";

type Options = SimIamRequestOptions | undefined;
type Empty = Promise<SimIamEmptyOutput>;

/**
 * The simulated IAM facade's commands on Users after they are created, and on
 * groups.
 *
 * They sit apart from `SimIam` because it grows by one delegating method per
 * simulated operation, and a file has a length this codebase allows.
 */
export abstract class SimIamIdentityOperations extends SimIamPolicyOperations {
  /** Handle an IAM GetUser command. */
  async getUser(
    command: users.SimGetUserCommand,
    options?: Options,
  ): Promise<users.SimGetUserCommandOutput> {
    return await this.commands.userReads.getUser(command, options);
  }

  /** Handle an IAM ListUsers command. */
  async listUsers(
    command: users.SimListUsersCommand,
    options?: Options,
  ): Promise<users.SimListUsersCommandOutput> {
    return await this.commands.userReads.listUsers(command, options);
  }

  /** Handle an IAM ListAccessKeys command. */
  async listAccessKeys(
    command: users.SimListAccessKeysCommand,
    options?: Options,
  ): Promise<users.SimListAccessKeysCommandOutput> {
    return await this.commands.accessKeys.listAccessKeys(command, options);
  }

  /** Handle an IAM UpdateAccessKey command. */
  async updateAccessKey(
    command: users.SimUpdateAccessKeyCommand,
    options?: Options,
  ): Empty {
    return await this.commands.accessKeys.updateAccessKey(command, options);
  }

  /** Handle an IAM DeleteAccessKey command. */
  async deleteAccessKey(
    command: users.SimAccessKeyCommand,
    options?: Options,
  ): Empty {
    return await this.commands.accessKeys.deleteAccessKey(command, options);
  }

  /** Handle an IAM GetLoginProfile command. */
  async getLoginProfile(
    command: users.SimLoginProfileCommand,
    options?: Options,
  ): Promise<users.SimGetLoginProfileCommandOutput> {
    return await this.commands.loginProfiles.getLoginProfile(command, options);
  }

  /** Handle an IAM DeleteLoginProfile command. */
  async deleteLoginProfile(
    command: users.SimLoginProfileCommand,
    options?: Options,
  ): Empty {
    return await this.commands.loginProfiles.deleteLoginProfile(
      command,
      options,
    );
  }

  /** Handle an IAM PutUserPermissionsBoundary command. */
  async putUserPermissionsBoundary(
    command: updates.SimPutUserPermissionsBoundaryCommand,
    options?: Options,
  ): Empty {
    return await this.commands.userBoundaries.put(
      command.input.UserName,
      command.input.PermissionsBoundary,
      options,
    );
  }

  /** Handle an IAM DeleteUserPermissionsBoundary command. */
  async deleteUserPermissionsBoundary(
    command: updates.SimDeleteUserPermissionsBoundaryCommand,
    options?: Options,
  ): Empty {
    return await this.commands.userBoundaries.delete(
      command.input.UserName,
      options,
    );
  }

  /** Handle an IAM CreateGroup command. */
  async createGroup(
    command: groups.SimCreateGroupCommand,
    options?: Options,
  ): Promise<groups.SimCreateGroupCommandOutput> {
    return await this.commands.groups.createGroup(command, options);
  }

  /** Handle an IAM GetGroup command. */
  async getGroup(
    command: groups.SimGetGroupCommand,
    options?: Options,
  ): Promise<groups.SimGetGroupCommandOutput> {
    return await this.commands.groups.getGroup(command, options);
  }

  /** Handle an IAM ListGroups command. */
  async listGroups(
    command: groups.SimListGroupsCommand,
    options?: Options,
  ): Promise<groups.SimListGroupsCommandOutput> {
    return await this.commands.groupLists.listGroups(command, options);
  }

  /** Handle an IAM ListGroupsForUser command. */
  async listGroupsForUser(
    command: groups.SimListGroupsForUserCommand,
    options?: Options,
  ): Promise<groups.SimListGroupsCommandOutput> {
    return await this.commands.groupLists.listGroupsForUser(command, options);
  }

  /** Handle an IAM DeleteGroup command. */
  async deleteGroup(
    command: groups.SimDeleteGroupCommand,
    options?: Options,
  ): Empty {
    return await this.commands.groups.deleteGroup(command, options);
  }

  /** Handle an IAM AddUserToGroup command. */
  async addUserToGroup(
    command: groups.SimGroupMembershipCommand,
    options?: Options,
  ): Empty {
    return await this.commands.groupMembers.addUserToGroup(command, options);
  }

  /** Handle an IAM RemoveUserFromGroup command. */
  async removeUserFromGroup(
    command: groups.SimGroupMembershipCommand,
    options?: Options,
  ): Empty {
    return await this.commands.groupMembers.removeUserFromGroup(
      command,
      options,
    );
  }
}
