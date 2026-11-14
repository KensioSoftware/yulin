import type { SimIamRequestOptions } from "./command/sim-iam-request-options.js";
import type { SimIamEmptyOutput } from "./command/entity/sim-iam-entity-policy.command.js";
import type * as updates from "./command/entity/sim-iam-entity-update.command.js";
import type * as profiles from "./command/instance-profile/sim-iam-instance-profile.command.js";
import type * as account from "./command/account/sim-iam-account-summary-commands.js";
import { SimIamIdentityOperations } from "./sim-iam-identity-operations.js";

type Options = SimIamRequestOptions | undefined;
type Empty = Promise<SimIamEmptyOutput>;
type Profile = Promise<profiles.SimInstanceProfileCommandOutput>;
type Profiles = Promise<profiles.SimListInstanceProfilesCommandOutput>;

/**
 * The simulated IAM facade's commands on instance profiles, the renaming
 * commands, and the Account summary.
 *
 * They sit apart from `SimIam` because it grows by one delegating method per
 * simulated operation, and a file has a length this codebase allows.
 */
export abstract class SimIamProfileOperations extends SimIamIdentityOperations {
  /** Handle an IAM CreateInstanceProfile command. */
  async createInstanceProfile(
    command: profiles.SimCreateInstanceProfileCommand,
    options?: Options,
  ): Profile {
    return await this.commands.instanceProfiles.createInstanceProfile(
      command,
      options,
    );
  }

  /** Handle an IAM GetInstanceProfile command. */
  async getInstanceProfile(
    command: profiles.SimInstanceProfileCommand,
    options?: Options,
  ): Profile {
    return await this.commands.instanceProfiles.getInstanceProfile(
      command,
      options,
    );
  }

  /** Handle an IAM ListInstanceProfiles command. */
  async listInstanceProfiles(
    command: profiles.SimListInstanceProfilesCommand,
    options?: Options,
  ): Profiles {
    return await this.commands.instanceProfiles.listInstanceProfiles(
      command,
      options,
    );
  }

  /** Handle an IAM DeleteInstanceProfile command. */
  async deleteInstanceProfile(
    command: profiles.SimInstanceProfileCommand,
    options?: Options,
  ): Empty {
    return await this.commands.instanceProfiles.deleteInstanceProfile(
      command,
      options,
    );
  }

  /** Handle an IAM AddRoleToInstanceProfile command. */
  async addRoleToInstanceProfile(
    command: profiles.SimInstanceProfileRoleCommand,
    options?: Options,
  ): Empty {
    return await this.commands.instanceProfileRoles.addRoleToInstanceProfile(
      command,
      options,
    );
  }

  /** Handle an IAM RemoveRoleFromInstanceProfile command. */
  async removeRoleFromInstanceProfile(
    command: profiles.SimInstanceProfileRoleCommand,
    options?: Options,
  ): Empty {
    return await this.commands.instanceProfileRoles.removeRoleFromInstanceProfile(
      command,
      options,
    );
  }

  /** Handle an IAM ListInstanceProfilesForRole command. */
  async listInstanceProfilesForRole(
    command: profiles.SimListInstanceProfilesForRoleCommand,
    options?: Options,
  ): Profiles {
    return await this.commands.instanceProfileRoles.listInstanceProfilesForRole(
      command,
      options,
    );
  }

  /** Handle an IAM UpdateUser command. */
  async updateUser(
    command: updates.SimUpdateUserCommand,
    options?: Options,
  ): Empty {
    return await this.commands.userRenames.updateUser(command, options);
  }

  /** Handle an IAM UpdateGroup command. */
  async updateGroup(
    command: updates.SimUpdateGroupCommand,
    options?: Options,
  ): Empty {
    return await this.commands.groupRenames.updateGroup(command, options);
  }

  /** Handle an IAM GetAccountSummary command. */
  async getAccountSummary(
    command: account.SimGetAccountSummaryCommand,
    options?: Options,
  ): Promise<account.SimGetAccountSummaryCommandOutput> {
    return await this.commands.accountSummary.getAccountSummary(
      command,
      options,
    );
  }
}
