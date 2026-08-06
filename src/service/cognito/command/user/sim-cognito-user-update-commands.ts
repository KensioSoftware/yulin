import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimCognitoPasswordCheck } from "../../user-pool/sim-cognito-password-check.js";
import { SimCognitoUnsimulatedUserOptions } from "./sim-cognito-unsimulated-user-options.js";
import type { SimCognitoRequestResolver } from "../sim-cognito-request-resolver.js";
import type {
  SimAdminDisableUserCommand,
  SimAdminDisableUserCommandOutput,
  SimAdminEnableUserCommand,
  SimAdminEnableUserCommandOutput,
  SimAdminSetUserPasswordCommand,
  SimAdminSetUserPasswordCommandOutput,
  SimAdminUpdateUserAttributesCommand,
  SimAdminUpdateUserAttributesCommandOutput,
} from "./user.command.js";

interface SimCognitoUserUpdateCommandsProperties {
  readonly resolver: SimCognitoRequestResolver;
}

interface SimCognitoCommandOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The commands that change a simulated user after it exists.
 *
 * These are the operations a test reaches for once a user has been created:
 * giving it a usable password, changing its attributes, and turning it off and
 * on again.
 */
export class SimCognitoUserUpdateCommands {
  private readonly resolver: SimCognitoRequestResolver;
  private readonly unsimulatedOptions = new SimCognitoUnsimulatedUserOptions();

  constructor(properties: SimCognitoUserUpdateCommandsProperties) {
    this.resolver = properties.resolver;
  }

  /**
   * Set a user's password.
   *
   * A permanent password confirms the user, which is what lets it sign in
   * normally. Without `Permanent: true` the password is temporary and the user
   * is left in `FORCE_CHANGE_PASSWORD`, exactly where `AdminCreateUser` left
   * it.
   */
  setPassword(
    command: SimAdminSetUserPasswordCommand,
    options?: SimCognitoCommandOptions,
  ): SimAdminSetUserPasswordCommandOutput {
    const { input } = command;
    const { pool, user } = this.resolver.poolUser(
      "cognito-idp:AdminSetUserPassword",
      input,
      options,
    );

    const password = new SimCognitoPasswordCheck(
      pool.settings.passwordPolicy,
    ).require("Password", input.Password);

    user.setPassword(password, input.Permanent);

    return { $metadata: {} };
  }

  /**
   * Change a user's attributes.
   *
   * The request names only the attributes it changes. The rest keep their
   * values, as they do on real Cognito.
   */
  updateAttributes(
    command: SimAdminUpdateUserAttributesCommand,
    options?: SimCognitoCommandOptions,
  ): SimAdminUpdateUserAttributesCommandOutput {
    const { input } = command;
    const user = this.resolver.user(
      "cognito-idp:AdminUpdateUserAttributes",
      input,
      options,
    );

    this.unsimulatedOptions.refuseInUpdate(input);

    user.updateAttributes(input.UserAttributes);

    return { $metadata: {} };
  }

  /**
   * Disable a user, which stops it authenticating.
   */
  disable(
    command: SimAdminDisableUserCommand,
    options?: SimCognitoCommandOptions,
  ): SimAdminDisableUserCommandOutput {
    this.resolver
      .user("cognito-idp:AdminDisableUser", command.input, options)
      .disable();

    return { $metadata: {} };
  }

  /**
   * Enable a user again.
   */
  enable(
    command: SimAdminEnableUserCommand,
    options?: SimCognitoCommandOptions,
  ): SimAdminEnableUserCommandOutput {
    this.resolver
      .user("cognito-idp:AdminEnableUser", command.input, options)
      .enable();

    return { $metadata: {} };
  }
}
