import type { SimCognitoMessageOccasion } from "../message/sim-cognito-message-occasion.js";
import type { SimCognitoTriggerName } from "./sim-cognito-trigger-name.js";

/**
 * One occasion a simulated user pool fires a trigger on.
 *
 * A trigger and the occasion it fired on are not the same thing. `PreSignUp`
 * runs both when a user signs itself up and when an admin creates one, and a
 * handler tells the two apart by the `triggerSource` on the event. The pair
 * travels together so a source is never derived from a trigger name, which
 * would only work while every trigger had one.
 *
 * The source is the real string real Cognito sends, because that is what a
 * handler written against a deployed pool branches on.
 */
export class SimCognitoTriggerOccasion {
  /**
   * A user signing itself up with `SignUp`.
   */
  public static readonly signUp = new SimCognitoTriggerOccasion(
    "PreSignUp",
    "PreSignUp_SignUp",
  );

  /**
   * An admin creating a user with `AdminCreateUser`.
   *
   * Real Cognito ignores everything a handler writes into the response on this
   * occasion, because the user it is about to create is already past
   * confirmation.
   */
  public static readonly adminCreateUser = new SimCognitoTriggerOccasion(
    "PreSignUp",
    "PreSignUp_AdminCreateUser",
  );

  /**
   * An external subject signing in at an identity provider for the first time.
   *
   * Real Cognito builds the pool's own user for a federated subject through
   * the sign-up path, so the trigger that guards a sign-up guards this too.
   * The attributes it carries are the ones the provider's `AttributeMapping`
   * produced, which is what the handler has to decide on.
   */
  public static readonly externalProviderSignUp = new SimCognitoTriggerOccasion(
    "PreSignUp",
    "PreSignUp_ExternalProvider",
  );

  /**
   * A signed-up user reaching `CONFIRMED`.
   *
   * `ConfirmSignUp`, `AdminConfirmSignUp` and a `PreSignUp` handler that
   * auto-confirmed the user all report this one source, as they do on real
   * Cognito.
   */
  public static readonly confirmSignUp = new SimCognitoTriggerOccasion(
    "PostConfirmation",
    "PostConfirmation_ConfirmSignUp",
  );

  /**
   * A user reaching `CONFIRMED` by finishing a password reset.
   *
   * Real Cognito runs `PostConfirmation` for `ConfirmForgotPassword` as well
   * as for a sign-up, under a source of its own, so a handler that creates a
   * profile record on first confirmation can tell the two apart.
   */
  public static readonly confirmForgotPassword = new SimCognitoTriggerOccasion(
    "PostConfirmation",
    "PostConfirmation_ConfirmForgotPassword",
  );

  /**
   * A sign-in, before the user's password is checked.
   */
  public static readonly preAuthentication = new SimCognitoTriggerOccasion(
    "PreAuthentication",
    "PreAuthentication_Authentication",
  );

  /**
   * A sign-in, once the tokens have been issued.
   */
  public static readonly postAuthentication = new SimCognitoTriggerOccasion(
    "PostAuthentication",
    "PostAuthentication_Authentication",
  );

  /**
   * The tokens a sign-in hands out.
   */
  public static readonly tokenGeneration = new SimCognitoTriggerOccasion(
    "PreTokenGeneration",
    "TokenGeneration_Authentication",
  );

  /**
   * The tokens a sign-in at an identity provider hands out.
   *
   * Real Cognito reports this source for a federated grant alone. A local
   * user signing in at managed login reports `TokenGeneration_Authentication`,
   * the same source its API sign-in reports.
   */
  public static readonly hostedTokenGeneration = new SimCognitoTriggerOccasion(
    "PreTokenGeneration",
    "TokenGeneration_HostedAuth",
  );

  /**
   * The tokens handed out where a sign-in finishes by answering the new
   * password challenge.
   *
   * This is also the one occasion a request's `ClientMetadata` reaches the
   * token trigger, because real Cognito passes it on from
   * `RespondToAuthChallenge` and `AdminRespondToAuthChallenge` alone.
   */
  public static readonly newPasswordTokenGeneration =
    new SimCognitoTriggerOccasion(
      "PreTokenGeneration",
      "TokenGeneration_NewPasswordChallenge",
    );

  /**
   * The tokens a `REFRESH_TOKEN_AUTH` refresh hands out.
   *
   * Real Cognito runs the token trigger again here, so a claim a handler has
   * changed since the sign-in reaches the reissued token rather than being
   * stale for the life of the session.
   */
  public static readonly refreshTokenGeneration = new SimCognitoTriggerOccasion(
    "PreTokenGeneration",
    "TokenGeneration_RefreshTokens",
  );

  /**
   * The verification message a user signing itself up is sent.
   */
  public static readonly customMessageSignUp = new SimCognitoTriggerOccasion(
    "CustomMessage",
    "CustomMessage_SignUp",
  );

  /**
   * The verification message a user asking for another code is sent.
   */
  public static readonly customMessageResendCode =
    new SimCognitoTriggerOccasion("CustomMessage", "CustomMessage_ResendCode");

  /**
   * The invitation an admin-created user is sent.
   */
  public static readonly customMessageAdminCreateUser =
    new SimCognitoTriggerOccasion(
      "CustomMessage",
      "CustomMessage_AdminCreateUser",
    );

  /**
   * The code a user resetting a forgotten password is sent.
   *
   * `AdminResetUserPassword` reports this source too, because real Cognito has
   * none of its own for the reset an administrator starts.
   */
  public static readonly customMessageForgotPassword =
    new SimCognitoTriggerOccasion(
      "CustomMessage",
      "CustomMessage_ForgotPassword",
    );

  /**
   * The code a sign-in challenged for a second factor is sent.
   */
  public static readonly customMessageAuthentication =
    new SimCognitoTriggerOccasion(
      "CustomMessage",
      "CustomMessage_Authentication",
    );

  public readonly trigger: SimCognitoTriggerName;
  public readonly source: string;

  private constructor(trigger: SimCognitoTriggerName, source: string) {
    this.trigger = trigger;
    this.source = source;
  }

  /**
   * The `CustomMessage` occasion a message is being sent on.
   *
   * One trigger covers all five, and the source is the only thing telling a
   * handler which it is firing for, so an application customising one message
   * and not another branches on it.
   */
  static customMessage(
    occasion: SimCognitoMessageOccasion,
  ): SimCognitoTriggerOccasion {
    // The key is one of a closed union, so the record has an entry for it and
    // the type checker is what says so.
    // oxlint-disable-next-line security/detect-object-injection
    return simCognitoMessageOccasions[occasion];
  }
}

/**
 * The `CustomMessage` occasion each message occasion fires under.
 *
 * A record rather than a switch, so that adding a message occasion is a line
 * here and the type checker names every gap.
 */
const simCognitoMessageOccasions: Readonly<
  Record<SimCognitoMessageOccasion, SimCognitoTriggerOccasion>
> = {
  SignUp: SimCognitoTriggerOccasion.customMessageSignUp,
  ResendCode: SimCognitoTriggerOccasion.customMessageResendCode,
  AdminCreateUser: SimCognitoTriggerOccasion.customMessageAdminCreateUser,
  Authentication: SimCognitoTriggerOccasion.customMessageAuthentication,
  ForgotPassword: SimCognitoTriggerOccasion.customMessageForgotPassword,
};
