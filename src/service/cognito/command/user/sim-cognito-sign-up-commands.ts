import { requireSimCognitoSecretHash } from "../../user-pool/auth/sim-cognito-secret-hash.js";
import type { SimCognitoPoolMessenger } from "../../user-pool/message/sim-cognito-pool-messenger.js";
import { SimCognitoTriggerOccasion } from "../../user-pool/trigger/sim-cognito-trigger-occasion.js";
import type { SimCognitoUserPoolTriggers } from "../../user-pool/trigger/sim-cognito-user-pool-triggers.js";
import type { SimCognitoUserFactory } from "../../user-pool/user/sim-cognito-user-factory.js";
import { requireSimCognitoUsername } from "../../user-pool/user/sim-cognito-username.js";
import { countedSimCognitoCompletion } from "../../metric/sim-cognito-counted-request.js";
import type { SimCognitoPoolMetrics } from "../../metric/sim-cognito-pool-metrics.js";
import type {
  SimCognitoAuthenticatingClient,
  SimCognitoAuthResolver,
} from "../auth/sim-cognito-auth-resolver.js";
import { simCognitoValidationData } from "../sim-cognito-validation-data.js";
import { SimCognitoUnsimulatedSignUpOptions } from "./sim-cognito-unsimulated-sign-up-options.js";
import type {
  SimSignUpCommand,
  SimSignUpCommandOutput,
} from "./sign-up.command.js";

interface SimCognitoSignUpCommandsProperties {
  readonly poolMetrics: SimCognitoPoolMetrics;
  readonly authResolver: SimCognitoAuthResolver;
  readonly userFactory: SimCognitoUserFactory;
  readonly triggers: SimCognitoUserPoolTriggers;
  readonly messenger: SimCognitoPoolMessenger;
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
  private readonly poolMetrics: SimCognitoPoolMetrics;
  private readonly authResolver: SimCognitoAuthResolver;
  private readonly userFactory: SimCognitoUserFactory;
  private readonly triggers: SimCognitoUserPoolTriggers;
  private readonly messenger: SimCognitoPoolMessenger;
  private readonly unsimulatedOptions =
    new SimCognitoUnsimulatedSignUpOptions();

  constructor(properties: SimCognitoSignUpCommandsProperties) {
    this.poolMetrics = properties.poolMetrics;
    this.authResolver = properties.authResolver;
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
    const scope = this.authResolver.client(command.input.ClientId);

    return await countedSimCognitoCompletion(
      this.poolMetrics,
      "SignUp",
      scope,
      async () => await this.registered(command, scope),
    );
  }

  private async registered(
    command: SimSignUpCommand,
    { pool, client }: SimCognitoAuthenticatingClient,
  ): Promise<SimSignUpCommandOutput> {
    const { input } = command;

    this.unsimulatedOptions.refuseInSignUp(input);
    pool.settings.adminCreateUserConfig.requireSelfServiceSignUp();

    const requested = requireSimCognitoUsername(input.Username);

    requireSimCognitoSecretHash(requested, client, input.SecretHash);

    // A pool signing users in by email or phone number stores a generated
    // UUID as the username and the value the request called the username as
    // the attribute it signs in by, as real Cognito does.
    const identity = pool.settings.usernameAttributes.identify(
      requested,
      input.UserAttributes,
    );

    const user = this.userFactory.signUp({
      username: identity.username,
      attributes: identity.attributes,
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
      await this.triggers.postConfirmation(
        SimCognitoTriggerOccasion.confirmSignUp,
        {
          pool,
          client,
          user,
          clientMetadata: input.ClientMetadata,
        },
      );
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
}
