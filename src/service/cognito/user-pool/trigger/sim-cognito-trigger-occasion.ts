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

  public readonly trigger: SimCognitoTriggerName;
  public readonly source: string;

  private constructor(trigger: SimCognitoTriggerName, source: string) {
    this.trigger = trigger;
    this.source = source;
  }
}
