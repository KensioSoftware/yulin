import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { requireSimCognitoSecretHash } from "../../user-pool/auth/sim-cognito-secret-hash.js";
import type { SimCognitoUserPoolClient } from "../../user-pool/client/sim-cognito-user-pool-client.js";
import { SimCognitoPasswordCheck } from "../../user-pool/sim-cognito-password-check.js";
import type { SimCognitoUserPool } from "../../user-pool/sim-cognito-user-pool.js";
import type { SimCognitoUser } from "../../user-pool/user/sim-cognito-user.js";
import type { SimCognitoUserFactory } from "../../user-pool/user/sim-cognito-user-factory.js";
import { requireSimCognitoUsername } from "../../user-pool/user/sim-cognito-username.js";
import type { SimCognitoAuthResolver } from "../auth/sim-cognito-auth-resolver.js";
import type { SimCognitoRequestResolver } from "../sim-cognito-request-resolver.js";
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
 * user, and `SimCognitoUserPool.confirmationCode` is where a test reads it
 * from.
 */
export class SimCognitoSignUpCommands {
  private readonly authResolver: SimCognitoAuthResolver;
  private readonly resolver: SimCognitoRequestResolver;
  private readonly userFactory: SimCognitoUserFactory;
  private readonly unsimulatedOptions =
    new SimCognitoUnsimulatedSignUpOptions();

  constructor(properties: SimCognitoSignUpCommandsProperties) {
    this.authResolver = properties.authResolver;
    this.resolver = properties.resolver;
    this.userFactory = properties.userFactory;
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
   */
  signUp(command: SimSignUpCommand): SimSignUpCommandOutput {
    const { input } = command;
    const { pool, client } = this.authResolver.client(input.ClientId);

    this.unsimulatedOptions.refuseInSignUp(input);
    pool.adminCreateUserConfig.requireSelfServiceSignUp();

    const username = requireSimCognitoUsername(input.Username);

    requireSimCognitoSecretHash(username, client, input.SecretHash);

    const user = this.userFactory.signUp({
      username,
      attributes: input.UserAttributes,
      password: new SimCognitoPasswordCheck(pool.passwordPolicy).require(
        "Password",
        input.Password,
      ),
    });

    pool.addUser(user);

    return { $metadata: {}, UserConfirmed: false, UserSub: user.sub };
  }

  /**
   * Confirm a sign-up with the code the pool issued.
   *
   * The user reaches `CONFIRMED` and can sign in from then on. The pool's
   * `AutoVerifiedAttributes` are marked verified here, because answering with
   * the code is what shows the address the code went to is the user's.
   */
  confirmSignUp(
    command: SimConfirmSignUpCommand,
  ): SimConfirmSignUpCommandOutput {
    const { input } = command;
    const { pool, client } = this.authResolver.client(input.ClientId);

    this.unsimulatedOptions.refuseInConfirm(input);

    const user = this.signingUpUser(pool, client, input);

    user.confirmSignUp(input.ConfirmationCode);
    user.verifyAttributes(pool.autoVerifiedAttributes.names);

    return { $metadata: {} };
  }

  /**
   * Issue a fresh confirmation code for a user waiting to be confirmed.
   *
   * The code the user had stops working, as it does on real Cognito, so a
   * test holding the earlier one has to read the new one from the pool.
   */
  resendConfirmationCode(
    command: SimResendConfirmationCodeCommand,
  ): SimResendConfirmationCodeCommandOutput {
    const { input } = command;
    const { pool, client } = this.authResolver.client(input.ClientId);

    this.unsimulatedOptions.refuseInResend(input);

    this.signingUpUser(pool, client, input).resendConfirmationCode();

    return { $metadata: {} };
  }

  /**
   * Confirm a sign-up as an administrator, with no code involved.
   *
   * Nothing is verified by this. Real Cognito leaves `email_verified` and
   * `phone_number_verified` alone here even on a pool with
   * `AutoVerifiedAttributes`, because an admin confirming a user says nothing
   * about whether the address is really theirs.
   */
  adminConfirmSignUp(
    command: SimAdminConfirmSignUpCommand,
    options?: SimCognitoCommandOptions,
  ): SimAdminConfirmSignUpCommandOutput {
    const { input } = command;

    const user = this.resolver.user(
      "cognito-idp:AdminConfirmSignUp",
      input,
      options,
    );

    this.unsimulatedOptions.refuseInAdminConfirm(input);

    user.confirm();

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
