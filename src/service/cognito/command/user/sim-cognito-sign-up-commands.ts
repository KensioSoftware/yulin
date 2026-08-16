import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { requireSimCognitoSecretHash } from "../../user-pool/auth/sim-cognito-secret-hash.js";
import type { SimCognitoUserPoolClient } from "../../user-pool/client/sim-cognito-user-pool-client.js";
import type { SimCognitoPoolMessenger } from "../../user-pool/message/sim-cognito-pool-messenger.js";
import type { SimCognitoUserPool } from "../../user-pool/sim-cognito-user-pool.js";
import { SimCognitoTriggerOccasion } from "../../user-pool/trigger/sim-cognito-trigger-occasion.js";
import type { SimCognitoUserPoolTriggers } from "../../user-pool/trigger/sim-cognito-user-pool-triggers.js";
import type { SimCognitoUser } from "../../user-pool/user/sim-cognito-user.js";
import type { SimCognitoUserFactory } from "../../user-pool/user/sim-cognito-user-factory.js";
import { requireSimCognitoUsername } from "../../user-pool/user/sim-cognito-username.js";
import type { SimCognitoAuthResolver } from "../auth/sim-cognito-auth-resolver.js";
import type { SimCognitoRequestResolver } from "../sim-cognito-request-resolver.js";
import { simCognitoValidationData } from "../sim-cognito-validation-data.js";
import { SimCognitoUnsimulatedSignUpOptions } from "./sim-cognito-unsimulated-sign-up-options.js";
import type {
  SimAdminConfirmSignUpCommand,
  SimAdminConfirmSignUpCommandOutput,
  SimCognitoSignUpCommandInput,
  SimConfirmSignUpCommand,
  SimConfirmSignUpCommandOutput,
  SimResendConfirmationCodeCommand,
  SimResendConfirmationCodeCommandOutput,
  SimSignUpCommand,
  SimSignUpCommandOutput,
} from "./sign-up.command.js";

interface SimCognitoSignUpCommandsProperties {
  readonly authResolver: SimCognitoAuthResolver;
  readonly resolver: SimCognitoRequestResolver;
  readonly userFactory: SimCognitoUserFactory;
  readonly triggers: SimCognitoUserPoolTriggers;
  readonly messenger: SimCognitoPoolMessenger;
}

interface SimCognitoCommandOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The commands a user signs itself up with, and the one an admin confirms it
 * with.
 *
 * The first three are what a browser or mobile app calls, so no IAM permission
 * is involved and no caller is read, as with the client-side sign-in commands:
 * the app client id is what finds the pool. `AdminConfirmSignUp` is the
 * exception, and authorizes against the pool's ARN the way every other admin
 * operation does.
 *
 * Nothing here delivers the confirmation code. It is issued and held on the
 * user, `SimCognitoUserPool.confirmationCode` is where a test reads it from,
 * and the message the pool would have sent it in is recorded on the pool.
 */
export class SimCognitoSignUpCommands {
  private readonly authResolver: SimCognitoAuthResolver;
  private readonly resolver: SimCognitoRequestResolver;
  private readonly userFactory: SimCognitoUserFactory;
  private readonly triggers: SimCognitoUserPoolTriggers;
  private readonly messenger: SimCognitoPoolMessenger;
  private readonly unsimulatedOptions =
    new SimCognitoUnsimulatedSignUpOptions();

  constructor(properties: SimCognitoSignUpCommandsProperties) {
    this.authResolver = properties.authResolver;
    this.resolver = properties.resolver;
    this.userFactory = properties.userFactory;
    this.triggers = properties.triggers;
    this.messenger = properties.messenger;
  }

  /**
   * Sign a new user up.
   *
   * The user is left in `UNCONFIRMED` holding a confirmation code, which is
   * where real Cognito leaves one: it has the password it chose and cannot
   * sign in with it until the sign-up is confirmed. The password is checked
   * against the pool's policy first, as `AdminCreateUser` checks a temporary
   * one, and a username the pool already holds is refused whether that user
   * signed itself up or an admin created it.
   *
   * The pool's `PreSignUp` trigger runs before the user is added, so a handler
   * that throws leaves the pool without it. A handler answering
   * `autoConfirmUser` takes the user straight to `CONFIRMED` and reaches
   * `PostConfirmation` here rather than at a `ConfirmSignUp` that never comes,
   * which is what real Cognito does for a pool whose users never confirm.
   *
   * The verification message is recorded for a user that has to confirm, and
   * for no other: a user the trigger auto-confirmed has nothing to answer with
   * a code, so real Cognito sends it none.
   */
  async signUp(command: SimSignUpCommand): Promise<SimSignUpCommandOutput> {
    const { input } = command;
    const { pool, client } = this.authResolver.client(input.ClientId);

    this.unsimulatedOptions.refuseInSignUp(input);
    pool.settings.adminCreateUserConfig.requireSelfServiceSignUp();

    const username = requireSimCognitoUsername(input.Username);

    requireSimCognitoSecretHash(username, client, input.SecretHash);

    const user = this.userFactory.signUp({
      username,
      attributes: input.UserAttributes,
      schema: pool.settings.schema,
      password: input.Password,
      passwordPolicy: pool.settings.passwordPolicy,
    });

    const preSignUp = await this.triggers.preSignUp(
      SimCognitoTriggerOccasion.signUp,
      {
        pool,
        client,
        user,
        clientMetadata: input.ClientMetadata,
        validationData: simCognitoValidationData(
          input.ValidationData,
          "SignUp",
        ),
      },
    );

    preSignUp.verifyAttributesOf(user);
    pool.addUser(user);

    if (preSignUp.autoConfirmUser) {
      user.confirm();
      await this.triggers.postConfirmation({
        pool,
        client,
        user,
        clientMetadata: input.ClientMetadata,
      });
    } else {
      await this.messenger.send({
        pool,
        user,
        client,
        occasion: "SignUp",
        code: user.confirmationCode,
        clientMetadata: input.ClientMetadata,
      });
    }

    return {
      $metadata: {},
      UserConfirmed: preSignUp.autoConfirmUser,
      UserSub: user.sub,
    };
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

    await this.triggers.postConfirmation({
      pool,
      client,
      user,
      clientMetadata: input.ClientMetadata,
    });

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

    await this.triggers.postConfirmation({
      pool,
      user,
      clientMetadata: input.ClientMetadata,
    });

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
