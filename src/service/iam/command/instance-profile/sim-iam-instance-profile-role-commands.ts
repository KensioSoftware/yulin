import {
  SimIamLimitExceeded,
  SimIamNoSuchEntity,
} from "../../error/sim-iam.error.js";
import type { SimIamEmptyOutput } from "../entity/sim-iam-entity-policy.command.js";
import { simIamRefuseWhen } from "../sim-iam-found.js";
import type { SimIamRequestOptions } from "../sim-iam-request-options.js";
import type { SimIamInstanceProfileCommands } from "./sim-iam-instance-profile-commands.js";
import type { SimIamInstanceProfileLookup } from "./sim-iam-instance-profile-lookup.js";
import type {
  SimInstanceProfileRoleCommand,
  SimListInstanceProfilesCommandOutput,
  SimListInstanceProfilesForRoleCommand,
} from "./sim-iam-instance-profile.command.js";

/**
 * The service an instance profile hands its Role to, which is what
 * `iam:PassedToService` carries when a Role is added to one.
 */
const instanceProfileService = "ec2.amazonaws.com";

/**
 * The commands that put a Role in an instance profile, take it out, and list
 * the instance profiles a Role is in.
 */
export class SimIamInstanceProfileRoleCommands {
  constructor(
    private readonly lookup: SimIamInstanceProfileLookup,
    private readonly profiles: SimIamInstanceProfileCommands,
  ) {}

  /**
   * Put a Role in an instance profile holding none. Handing the Role over
   * needs `iam:PassRole` on it as well.
   */
  async addRoleToInstanceProfile(
    command: SimInstanceProfileRoleCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimIamEmptyOutput> {
    await this.lookup.sequence();
    const { input } = command;
    const profile = this.lookup.profile(
      "AddRoleToInstanceProfile",
      input.InstanceProfileName,
      options,
    );
    const role = this.lookup.existingRole(input.RoleName);
    this.lookup.properties.authorizer.authorize(
      "iam:PassRole",
      role.arn,
      options?.caller,
      {
        "iam:PassedToService": instanceProfileService,
        // AWS names any instance in the Account, since the profile has
        // none yet.
        "iam:AssociatedResourceArn": `arn:aws:ec2:*:${this.lookup.properties.accountId}:instance/*`,
      },
    );

    simIamRefuseWhen(
      profile.roleName !== undefined,
      () =>
        new SimIamLimitExceeded(
          "Cannot exceed quota for InstanceSessionsPerInstanceProfile: 1",
        ),
    );
    profile.roleName = role.roleName;

    return {};
  }

  /**
   * Take a Role out of the instance profile holding it.
   */
  async removeRoleFromInstanceProfile(
    command: SimInstanceProfileRoleCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimIamEmptyOutput> {
    await this.lookup.sequence();
    const { input } = command;
    const profile = this.lookup.profile(
      "RemoveRoleFromInstanceProfile",
      input.InstanceProfileName,
      options,
    );
    const role = this.lookup.existingRole(input.RoleName);

    simIamRefuseWhen(
      profile.roleName !== role.roleName,
      () =>
        new SimIamNoSuchEntity(
          `The role with name ${role.roleName} cannot be found.`,
        ),
    );
    profile.roleName = undefined;

    return {};
  }

  /**
   * List the instance profiles holding a Role.
   */
  async listInstanceProfilesForRole(
    command: SimListInstanceProfilesForRoleCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimListInstanceProfilesCommandOutput> {
    await this.lookup.sequence();
    const role = this.lookup.role(
      "ListInstanceProfilesForRole",
      command.input.RoleName,
      options,
    );

    return this.profiles.page(
      this.lookup.properties.instanceProfiles
        .values()
        .filter((profile) => profile.roleName === role.roleName),
      command.input,
    );
  }
}
