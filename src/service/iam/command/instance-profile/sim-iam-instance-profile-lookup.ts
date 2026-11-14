import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import type { SimIamActionAuthorizer } from "../../authorize/sim-iam-action-authorizer.js";
import { SimIamNoSuchEntity } from "../../error/sim-iam.error.js";
import type {
  SimIamInstanceProfile,
  SimIamInstanceProfileName,
} from "../../instance-profile/sim-iam-instance-profile.js";
import type { SimIamRole, SimIamRoleName } from "../../role/sim-iam-role.js";
import type { SimIamIdentityAuthorizer } from "../../tag/sim-iam-identity-authorizer.js";
import { simIamDefined, simIamFound } from "../sim-iam-found.js";
import type { SimIamRequestOptions } from "../sim-iam-request-options.js";
import { simIamRequired } from "../sim-iam-required.js";
import type { SimIamInstanceProfileOutput } from "./sim-iam-instance-profile.command.js";
import { simIamInstanceProfileOutput } from "./sim-iam-instance-profile-output.js";

export interface SimIamInstanceProfileLookupProperties {
  readonly accountId: SimAwsAccountId;
  readonly instanceProfiles: Map<
    SimIamInstanceProfileName,
    SimIamInstanceProfile
  >;
  readonly roles: Map<SimIamRoleName, SimIamRole>;
  readonly profileIdentity: SimIamIdentityAuthorizer;
  readonly roleIdentity: SimIamIdentityAuthorizer;
  readonly authorizer: SimIamActionAuthorizer;
  readonly background: BackgroundScheduler;
}

/**
 * Finds the instance profile or Role an instance profile command names, once
 * the caller is allowed the command's action on it, and describes a profile
 * the way IAM does.
 */
export class SimIamInstanceProfileLookup {
  constructor(readonly properties: SimIamInstanceProfileLookupProperties) {}

  /**
   * Wait for the simulation's sequencing point. A command waits here first,
   * so authorizing, finding and changing its entity then run with nothing
   * in between.
   */
  async sequence(): Promise<void> {
    await this.properties.background.sequence();
  }

  /**
   * Authorize an action on the named instance profile, and find it.
   */
  profile(
    action: string,
    profileName: string | undefined,
    options: SimIamRequestOptions | undefined,
  ): SimIamInstanceProfile {
    const { profileIdentity, instanceProfiles } = this.properties;
    const name = simIamRequired(profileName, "instanceProfileName");
    profileIdentity.authorize(`iam:${action}`, name, options);

    return simIamDefined(
      instanceProfiles.get(name as SimIamInstanceProfileName),
      () => new SimIamNoSuchEntity(`Instance Profile ${name} cannot be found.`),
    );
  }

  /**
   * Authorize an action on the named Role, and find it.
   */
  role(
    action: string,
    roleName: string | undefined,
    options: SimIamRequestOptions | undefined,
  ): SimIamRole {
    const name = simIamRequired(roleName, "roleName");
    this.properties.roleIdentity.authorize(`iam:${action}`, name, options);

    return this.existingRole(name);
  }

  /**
   * Find a Role a command has already authorized through something else.
   */
  existingRole(roleName: string | undefined): SimIamRole {
    const name = simIamRequired(roleName, "roleName");

    return simIamFound(
      this.properties.roles.get(name as SimIamRoleName),
      "role",
      name,
    );
  }

  /**
   * Describe an instance profile, with the Role it holds.
   */
  output(profile: SimIamInstanceProfile): SimIamInstanceProfileOutput {
    const { roleName } = profile;

    return simIamInstanceProfileOutput(
      profile,
      roleName && this.properties.roles.get(roleName),
    );
  }
}
