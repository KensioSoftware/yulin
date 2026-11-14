import { SimIamNoSuchEntity } from "../../error/sim-iam.error.js";
import type { SimIamUser } from "../../user/sim-iam-user.js";
import type { SimIamUserLoginProfile } from "../../user/sim-iam-user-login-profile.js";
import type { SimIamEmptyOutput } from "../entity/sim-iam-entity-policy.command.js";
import type { SimIamRequestOptions } from "../sim-iam-request-options.js";
import type { SimIamUserLookup } from "./sim-iam-user-lookup.js";
import type {
  SimGetLoginProfileCommandOutput,
  SimLoginProfileCommand,
} from "./sim-iam-user-read.command.js";

/**
 * The commands that describe and delete a User's login profile.
 */
export class SimIamLoginProfileCommands {
  constructor(private readonly lookup: SimIamUserLookup) {}

  /**
   * Describe a User's login profile, which never includes the password.
   */
  async getLoginProfile(
    command: SimLoginProfileCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimGetLoginProfileCommandOutput> {
    const { user, profile } = await this.profile(
      "GetLoginProfile",
      command,
      options,
    );

    return {
      LoginProfile: {
        UserName: user.userName,
        CreateDate: profile.createDate,
        PasswordResetRequired: profile.passwordResetRequired,
      },
    };
  }

  /**
   * Remove a User's login profile.
   */
  async deleteLoginProfile(
    command: SimLoginProfileCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimIamEmptyOutput> {
    const { user } = await this.profile("DeleteLoginProfile", command, options);
    user.loginProfile = undefined;

    return {};
  }

  private async profile(
    action: string,
    command: SimLoginProfileCommand,
    options: SimIamRequestOptions | undefined,
  ): Promise<{
    readonly user: SimIamUser;
    readonly profile: SimIamUserLoginProfile;
  }> {
    const user = await this.lookup.user(
      action,
      command.input.UserName,
      options,
    );

    if (user.loginProfile === undefined) {
      throw new SimIamNoSuchEntity(
        `Login Profile for User ${user.userName} cannot be found.`,
      );
    }

    return { user, profile: user.loginProfile };
  }
}
