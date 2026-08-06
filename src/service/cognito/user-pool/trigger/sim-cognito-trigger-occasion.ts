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

  public readonly trigger: SimCognitoTriggerName;
  public readonly source: string;

  private constructor(trigger: SimCognitoTriggerName, source: string) {
    this.trigger = trigger;
    this.source = source;
  }

  /**
   * The `CustomMessage` occasion a message is being sent on.
   *
   * One trigger covers all three, and the source is the only thing telling a
   * handler which it is firing for, so an application customising one message
   * and not another branches on it.
   */
  static customMessage(
    occasion: SimCognitoMessageOccasion,
  ): SimCognitoTriggerOccasion {
    switch (occasion) {
      case "SignUp": {
        return SimCognitoTriggerOccasion.customMessageSignUp;
      }
      case "ResendCode": {
        return SimCognitoTriggerOccasion.customMessageResendCode;
      }
      case "AdminCreateUser": {
        return SimCognitoTriggerOccasion.customMessageAdminCreateUser;
      }
    }
  }
}
