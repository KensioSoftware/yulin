import type * as simIamCommands from "./command/sim-iam-command.types.js";
import type { SimIamCommandHandlers } from "./command/sim-iam-command-handlers.js";
import type { SimIamRequestOptions } from "./command/sim-iam-request-options.js";

/**
 * The tagging commands of the simulated IAM facade, for Roles and Users.
 *
 * They sit here because `SimIam` grows by one delegating method per simulated
 * operation and is near the length this codebase allows.
 */
export abstract class SimIamTagOperations {
  protected abstract readonly commands: SimIamCommandHandlers;

  /** Handle a Tag Role Command from the SDK. */
  async tagRole(
    command: simIamCommands.SimTagRoleCommand,
    options?: SimIamRequestOptions,
  ): Promise<simIamCommands.SimIamTaggingCommandOutput> {
    return await this.commands.roleTags.tag(
      command.input.RoleName,
      command.input.Tags,
      options,
    );
  }

  /** Handle an Untag Role Command from the SDK. */
  async untagRole(
    command: simIamCommands.SimUntagRoleCommand,
    options?: SimIamRequestOptions,
  ): Promise<simIamCommands.SimIamTaggingCommandOutput> {
    return await this.commands.roleTags.untag(
      command.input.RoleName,
      command.input.TagKeys,
      options,
    );
  }

  /** Handle a List Role Tags Command from the SDK. */
  async listRoleTags(
    command: simIamCommands.SimListRoleTagsCommand,
    options?: SimIamRequestOptions,
  ): Promise<simIamCommands.SimIamListTagsCommandOutput> {
    return await this.commands.roleTags.list(command.input.RoleName, options);
  }

  /** Handle a Tag User Command from the SDK. */
  async tagUser(
    command: simIamCommands.SimTagUserCommand,
    options?: SimIamRequestOptions,
  ): Promise<simIamCommands.SimIamTaggingCommandOutput> {
    return await this.commands.userTags.tag(
      command.input.UserName,
      command.input.Tags,
      options,
    );
  }

  /** Handle an Untag User Command from the SDK. */
  async untagUser(
    command: simIamCommands.SimUntagUserCommand,
    options?: SimIamRequestOptions,
  ): Promise<simIamCommands.SimIamTaggingCommandOutput> {
    return await this.commands.userTags.untag(
      command.input.UserName,
      command.input.TagKeys,
      options,
    );
  }

  /** Handle a List User Tags Command from the SDK. */
  async listUserTags(
    command: simIamCommands.SimListUserTagsCommand,
    options?: SimIamRequestOptions,
  ): Promise<simIamCommands.SimIamListTagsCommandOutput> {
    return await this.commands.userTags.list(command.input.UserName, options);
  }
}
