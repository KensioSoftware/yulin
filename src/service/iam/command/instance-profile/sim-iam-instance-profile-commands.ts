import type { SimArn } from "../../../aws/arn.js";
import { SimIamDeleteConflict } from "../../error/sim-iam.error.js";
import {
  makeSimIamInstanceProfileId,
  type SimIamInstanceProfile,
  type SimIamInstanceProfileName,
} from "../../instance-profile/sim-iam-instance-profile.js";
import { makeSimIamIdentityTags } from "../../tag/sim-iam-identity-tags.js";
import { normaliseUserPath } from "../../user/sim-iam-user-path.js";
import type { SimIamEmptyOutput } from "../entity/sim-iam-entity-policy.command.js";
import { assertSimIamEntityName } from "../group/sim-iam-group-name.js";
import { assertSimIamNewEntity } from "../sim-iam-account-quota.js";
import { simIamRefuseWhen } from "../sim-iam-found.js";
import { simIamPage } from "../sim-iam-page.js";
import type { SimIamRequestOptions } from "../sim-iam-request-options.js";
import { simIamRequired } from "../sim-iam-required.js";
import type { SimIamInstanceProfileLookup } from "./sim-iam-instance-profile-lookup.js";
import type {
  SimCreateInstanceProfileCommand,
  SimInstanceProfileCommand,
  SimInstanceProfileCommandOutput,
  SimListInstanceProfilesCommand,
  SimListInstanceProfilesCommandOutput,
} from "./sim-iam-instance-profile.command.js";

/**
 * The commands that create, describe, list and delete IAM instance profiles.
 */
export class SimIamInstanceProfileCommands {
  constructor(private readonly lookup: SimIamInstanceProfileLookup) {}

  /**
   * Create an empty instance profile at a path, `/` where the command gives
   * none.
   */
  async createInstanceProfile(
    command: SimCreateInstanceProfileCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimInstanceProfileCommandOutput> {
    await this.lookup.sequence();
    const { accountId, instanceProfiles, profileIdentity, background } =
      this.lookup.properties;
    const { input } = command;
    const name = simIamRequired(
      input.InstanceProfileName,
      "instanceProfileName",
    );
    const path = normaliseUserPath(input.Path);
    assertSimIamEntityName(name, "instanceProfileName");
    profileIdentity.authorizeCreate(name, path, input.Tags, options);
    assertSimIamNewEntity("InstanceProfiles", instanceProfiles.keys(), name);

    const profile: SimIamInstanceProfile = {
      arn: `arn:aws:iam::${accountId}:instance-profile${path}${name}` as SimArn,
      instanceProfileId: makeSimIamInstanceProfileId(),
      instanceProfileName: name as SimIamInstanceProfileName,
      path,
      creationDate: background.now(),
      roleName: undefined,
      tags: makeSimIamIdentityTags(input.Tags, "InstanceProfile"),
    };
    instanceProfiles.set(profile.instanceProfileName, profile);

    return { InstanceProfile: this.lookup.output(profile) };
  }

  /**
   * Describe an instance profile, with the Role it holds.
   */
  async getInstanceProfile(
    command: SimInstanceProfileCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimInstanceProfileCommandOutput> {
    await this.lookup.sequence();
    const profile = this.lookup.profile(
      "GetInstanceProfile",
      command.input.InstanceProfileName,
      options,
    );

    return { InstanceProfile: this.lookup.output(profile) };
  }

  /**
   * List the Account's instance profiles in name order, under a path prefix
   * if given.
   */
  async listInstanceProfiles(
    command: SimListInstanceProfilesCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimListInstanceProfilesCommandOutput> {
    await this.lookup.sequence();
    const { authorizer, instanceProfiles } = this.lookup.properties;
    authorizer.authorize("iam:ListInstanceProfiles", "*", options?.caller);
    const prefix = command.input.PathPrefix ?? "/";

    return this.page(
      instanceProfiles.values().filter((each) => each.path.startsWith(prefix)),
      command.input,
    );
  }

  /**
   * Delete an instance profile holding no Role.
   */
  async deleteInstanceProfile(
    command: SimInstanceProfileCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimIamEmptyOutput> {
    await this.lookup.sequence();
    const profile = this.lookup.profile(
      "DeleteInstanceProfile",
      command.input.InstanceProfileName,
      options,
    );

    simIamRefuseWhen(
      profile.roleName !== undefined,
      () =>
        new SimIamDeleteConflict(
          "Cannot delete entity, must remove roles from instance profile first.",
        ),
    );
    this.lookup.properties.instanceProfiles.delete(profile.instanceProfileName);

    return {};
  }

  /**
   * One page of instance profiles, in name order.
   */
  page(
    profiles: Iterable<SimIamInstanceProfile>,
    input: SimListInstanceProfilesCommand["input"],
  ): SimListInstanceProfilesCommandOutput {
    const { items, ...paging } = simIamPage(
      [...profiles].toSorted((a, b) =>
        a.instanceProfileName.localeCompare(b.instanceProfileName),
      ),
      (profile) => profile.instanceProfileName,
      input,
    );

    return {
      InstanceProfiles: items.map((profile) => this.lookup.output(profile)),
      ...paging,
    };
  }
}
