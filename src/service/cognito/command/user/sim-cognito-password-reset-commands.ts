import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { requireSimCognitoSecretHash } from "../../user-pool/auth/sim-cognito-secret-hash.js";
import {
  simCognitoCodeDelivery,
  simCognitoHiddenCodeDelivery,
} from "../../user-pool/message/sim-cognito-code-delivery.js";
import type { SimCognitoPoolMessenger } from "../../user-pool/message/sim-cognito-pool-messenger.js";
import { SimCognitoPasswordCheck } from "../../user-pool/sim-cognito-password-check.js";
import { SimCognitoTriggerOccasion } from "../../user-pool/trigger/sim-cognito-trigger-occasion.js";
import type { SimCognitoUserPoolTriggers } from "../../user-pool/trigger/sim-cognito-user-pool-triggers.js";
import { requireSimCognitoUsername } from "../../user-pool/user/sim-cognito-username.js";
import type { SimCognitoAuthResolver } from "../auth/sim-cognito-auth-resolver.js";
import type { SimCognitoRequestResolver } from "../sim-cognito-request-resolver.js";
import {
  findSimCognitoResettingUser,
  requireSimCognitoResetDelivery,
  requireSimCognitoResettingUser,
} from "./sim-cognito-resetting-user.js";
import { SimCognitoUnsimulatedPasswordResetOptions } from "./sim-cognito-unsimulated-password-reset-options.js";
import type {
  SimAdminResetUserPasswordCommand,
  SimAdminResetUserPasswordCommandOutput,
  SimConfirmForgotPasswordCommand,
  SimConfirmForgotPasswordCommandOutput,
  SimForgotPasswordCommand,
  SimForgotPasswordCommandOutput,
} from "./password-reset.command.js";

interface SimCognitoPasswordResetCommandsProperties {
  readonly authResolver: SimCognitoAuthResolver;
  readonly resolver: SimCognitoRequestResolver;
  readonly triggers: SimCognitoUserPoolTriggers;
  readonly messenger: SimCognitoPoolMessenger;
}

interface SimCognitoCommandOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The commands a user resets a forgotten password with, and the one an
 * administrator resets it for them with.
 *
 * The first two are what a browser or mobile app calls for someone who cannot
 * sign in, so no IAM permission is involved and no caller is read: the app
 * client id is what finds the pool, as it does for sign-up and sign-in.
 * `AdminResetUserPassword` authorizes against the pool's ARN the way every
 * other admin operation does.
 *
 * Nothing here delivers the code. It is issued and held on the user,
 * `SimCognitoUserPool.confirmationCode` is where a test reads it from, and the
 * message the pool would have sent it in is recorded on the pool.
 */
export class SimCognitoPasswordResetCommands {
  private readonly authResolver: SimCognitoAuthResolver;
  private readonly resolver: SimCognitoRequestResolver;
  private readonly triggers: SimCognitoUserPoolTriggers;
  private readonly messenger: SimCognitoPoolMessenger;
  private readonly unsimulatedOptions =
    new SimCognitoUnsimulatedPasswordResetOptions();

  constructor(properties: SimCognitoPasswordResetCommandsProperties) {
    this.authResolver = properties.authResolver;
    this.resolver = properties.resolver;
    this.triggers = properties.triggers;
    this.messenger = properties.messenger;
  }

  /**
   * Start a password reset, and answer with where the code went.
   *
   * The user keeps the password it has and stays where it is, because asking
   * to reset is not resetting: `ConfirmForgotPassword` is what changes
   * anything. A second request issues a second code and forgets the first.
   *
   * A pool with nowhere to send the code refuses, in the words real Cognito
   * refuses with, rather than answering as though a message had gone out. The
   * code goes to an attribute the pool verifies automatically, which is the
   * same address a sign-up code goes to.
   */
  async forgotPassword(
    command: SimForgotPasswordCommand,
  ): Promise<SimForgotPasswordCommandOutput> {
    const { input } = command;
    const { pool, client } = this.authResolver.client(input.ClientId);

    this.unsimulatedOptions.refuseInForgot(input);

    const username = requireSimCognitoUsername(input.Username);

    requireSimCognitoSecretHash(username, client, input.SecretHash);

    const user = findSimCognitoResettingUser(pool, client, username);

    if (user === undefined) {
      return {
        $metadata: {},
        CodeDeliveryDetails: simCognitoHiddenCodeDelivery(username),
      };
    }

    user.status.requireSelfResettable();

    const delivery = requireSimCognitoResetDelivery(pool, user);

    user.passwordReset.start();

    await this.messenger.send({
      pool,
      user,
      client,
      occasion: "ForgotPassword",
      code: user.confirmationCode,
      clientMetadata: input.ClientMetadata,
    });

    return {
      $metadata: {},
      CodeDeliveryDetails: simCognitoCodeDelivery(delivery),
    };
  }

  /**
   * Finish a password reset with the code the pool issued.
   *
   * The user reaches `CONFIRMED` and signs in with the password it chose from
   * then on. The password is checked against the pool's policy first, as every
   * other password is, and the code is spent whether or not the user had one
   * outstanding: a second attempt with the same code is refused.
   *
   * The pool's `PostConfirmation` trigger runs last, reporting
   * `PostConfirmation_ConfirmForgotPassword`, so a handler that fires on a
   * sign-up being confirmed can tell this occasion from that one.
   */
  async confirmForgotPassword(
    command: SimConfirmForgotPasswordCommand,
  ): Promise<SimConfirmForgotPasswordCommandOutput> {
    const { input } = command;
    const { pool, client } = this.authResolver.client(input.ClientId);

    this.unsimulatedOptions.refuseInConfirm(input);

    const username = requireSimCognitoUsername(input.Username);

    requireSimCognitoSecretHash(username, client, input.SecretHash);

    const user = requireSimCognitoResettingUser(pool, client, username);
    const password = new SimCognitoPasswordCheck(
      pool.settings.passwordPolicy,
    ).require("Password", input.Password);

    user.passwordReset.confirm(input.ConfirmationCode, password);

    await this.triggers.postConfirmation(
      SimCognitoTriggerOccasion.confirmForgotPassword,
      { pool, client, user, clientMetadata: input.ClientMetadata },
    );

    return { $metadata: {} };
  }

  /**
   * Take a user's password away, leaving it in `RESET_REQUIRED`.
   *
   * The user cannot sign in until it sets another one, which is what the
   * status is for, and the pool records the message carrying the code it sets
   * that one with. A user the pool has nowhere to write to is still reset, and
   * simply gets no message: the status change is what this operation is for.
   */
  async adminResetUserPassword(
    command: SimAdminResetUserPasswordCommand,
    options?: SimCognitoCommandOptions,
  ): Promise<SimAdminResetUserPasswordCommandOutput> {
    const { input } = command;
    const { pool, user } = this.resolver.poolUser(
      "cognito-idp:AdminResetUserPassword",
      input,
      options,
    );

    user.passwordReset.require();

    await this.messenger.send({
      pool,
      user,
      occasion: "ForgotPassword",
      code: user.confirmationCode,
      clientMetadata: input.ClientMetadata,
    });

    return { $metadata: {} };
  }
}
