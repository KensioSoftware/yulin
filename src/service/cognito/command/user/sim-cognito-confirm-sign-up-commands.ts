import { requireSimCognitoSecretHash } from "../../user-pool/auth/sim-cognito-secret-hash.js";
import type { SimCognitoUserPoolClient } from "../../user-pool/client/sim-cognito-user-pool-client.js";
import type { SimCognitoPoolMessenger } from "../../user-pool/message/sim-cognito-pool-messenger.js";
import type { SimCognitoUserPool } from "../../user-pool/sim-cognito-user-pool.js";
import { SimCognitoTriggerOccasion } from "../../user-pool/trigger/sim-cognito-trigger-occasion.js";
import type { SimCognitoUserPoolTriggers } from "../../user-pool/trigger/sim-cognito-user-pool-triggers.js";
import type { SimCognitoUser } from "../../user-pool/user/sim-cognito-user.js";
import { requireSimCognitoUsername } from "../../user-pool/user/sim-cognito-username.js";
import type { SimCognitoAuthResolver } from "../auth/sim-cognito-auth-resolver.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimCognitoRequestResolver } from "../sim-cognito-request-resolver.js";
import { SimCognitoUnsimulatedSignUpOptions } from "./sim-cognito-unsimulated-sign-up-options.js";
import type {
  SimAdminConfirmSignUpCommand,
  SimAdminConfirmSignUpCommandOutput,
  SimConfirmSignUpCommand,
  SimConfirmSignUpCommandOutput,
  SimCognitoSignUpCommandInput,
  SimResendConfirmationCodeCommand,
  SimResendConfirmationCodeCommandOutput,
} from "./sign-up.command.js";

interface SimCognitoConfirmSignUpCommandsProperties {
  readonly authResolver: SimCognitoAuthResolver;
  readonly resolver: SimCognitoRequestResolver;
  readonly triggers: SimCognitoUserPoolTriggers;
  readonly messenger: SimCognitoPoolMessenger;
}

interface SimCognitoCommandOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * Confirming a sign-up, and the code that confirms one.
 *
 * Held apart from the registration commands because the two halves of signing
 * up share nothing but the pool: registering makes a user and sends it a code,
 * and confirming reads a code back and runs `PostConfirmation`. An
 * administrator can do the second without the first ever having sent
 * anything.
 */
export class SimCognitoConfirmSignUpCommands {
  private readonly authResolver: SimCognitoAuthResolver;
  private readonly resolver: SimCognitoRequestResolver;
  private readonly triggers: SimCognitoUserPoolTriggers;
  private readonly messenger: SimCognitoPoolMessenger;
  private readonly unsimulatedOptions =
    new SimCognitoUnsimulatedSignUpOptions();

  constructor(properties: SimCognitoConfirmSignUpCommandsProperties) {
    this.authResolver = properties.authResolver;
    this.resolver = properties.resolver;
    this.triggers = properties.triggers;
    this.messenger = properties.messenger;
  }

  /**
   * Confirm a sign-up with the code the pool issued.
   *
   * The user reaches `CONFIRMED` and can sign in from then on. The pool's
   * `AutoVerifiedAttributes` are marked verified here, because answering with
   * the code is what shows the address the code went to is the user's. The
   * pool's `PostConfirmation` trigger runs last, on the confirmed user.
   */
  async confirmSignUp(
    command: SimConfirmSignUpCommand,
  ): Promise<SimConfirmSignUpCommandOutput> {
    const { input } = command;
    const { pool, client } = this.authResolver.client(input.ClientId);

    this.unsimulatedOptions.refuseInConfirm(input);

    const user = this.signingUpUser(pool, client, input);

    user.confirmSignUp(input.ConfirmationCode);
    user.verifyAttributes(pool.settings.autoVerifiedAttributes.names);

    await this.triggers.postConfirmation(
      SimCognitoTriggerOccasion.confirmSignUp,
      {
        pool,
        client,
        user,
        clientMetadata: input.ClientMetadata,
      },
    );

    return { $metadata: {} };
  }

  /**
   * Issue a fresh confirmation code for a user waiting to be confirmed.
   *
   * The code the user had stops working, as it does on real Cognito, so a
   * test holding the earlier one has to read the new one from the pool. The
   * pool records a second message carrying the fresh code, and a
   * `CustomMessage` handler tells this occasion from a sign-up by its
   * `CustomMessage_ResendCode` trigger source.
   */
  async resendConfirmationCode(
    command: SimResendConfirmationCodeCommand,
  ): Promise<SimResendConfirmationCodeCommandOutput> {
    const { input } = command;
    const { pool, client } = this.authResolver.client(input.ClientId);

    this.unsimulatedOptions.refuseInResend(input);

    const user = this.signingUpUser(pool, client, input);

    user.resendConfirmationCode();

    await this.messenger.send({
      pool,
      user,
      client,
      occasion: "ResendCode",
      code: user.confirmationCode,
      clientMetadata: input.ClientMetadata,
    });

    return { $metadata: {} };
  }

  /**
   * Confirm a sign-up as an administrator, with no code involved.
   *
   * Nothing is verified by this. Real Cognito leaves `email_verified` and
   * `phone_number_verified` alone here even on a pool with
   * `AutoVerifiedAttributes`, because an admin confirming a user says nothing
   * about whether the address is really theirs.
   *
   * The `PostConfirmation` trigger still runs, and reports the same
   * `PostConfirmation_ConfirmSignUp` source `ConfirmSignUp` does, because the
   * user being confirmed signed itself up either way. There is no app client
   * in the request, so the handler reads `CLIENT_ID_NOT_APPLICABLE`.
   */
  async adminConfirmSignUp(
    command: SimAdminConfirmSignUpCommand,
    options?: SimCognitoCommandOptions,
  ): Promise<SimAdminConfirmSignUpCommandOutput> {
    const { input } = command;

    const { pool, user } = this.resolver.poolUser(
      "cognito-idp:AdminConfirmSignUp",
      input,
      options,
    );

    user.confirm();

    await this.triggers.postConfirmation(
      SimCognitoTriggerOccasion.confirmSignUp,
      {
        pool,
        user,
        clientMetadata: input.ClientMetadata,
      },
    );

    return { $metadata: {} };
  }

  /**
   * Resolve the user a client-side sign-up operation names.
   *
   * The `SECRET_HASH` covers the username, so it is checked as soon as the
   * username is known and before anything looks the user up, which is the
   * order the sign-in commands check it in too.
   */
  private signingUpUser(
    pool: SimCognitoUserPool,
    client: SimCognitoUserPoolClient,
    input: SimCognitoSignUpCommandInput,
  ): SimCognitoUser {
    const username = requireSimCognitoUsername(input.Username);

    requireSimCognitoSecretHash(username, client, input.SecretHash);

    return pool.requireUser(username);
  }
}
