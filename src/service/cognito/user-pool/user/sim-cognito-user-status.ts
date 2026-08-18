import {
  SimCognitoInvalidParameterException,
  SimCognitoNotAuthorizedException,
} from "../../error/sim-cognito.error.js";

export type SimCognitoUserStatusValue =
  | "UNCONFIRMED"
  | "FORCE_CHANGE_PASSWORD"
  | "CONFIRMED"
  | "RESET_REQUIRED"
  | "EXTERNAL_PROVIDER";

/**
 * The status of one simulated user.
 *
 * Only the statuses this simulation can reach are modelled. A user created by
 * `AdminCreateUser` starts in `FORCE_CHANGE_PASSWORD`, which is what stops it
 * signing in normally on real Cognito, and reaches `CONFIRMED` when an admin
 * sets a permanent password on it. A user that signed itself up with `SignUp`
 * starts in `UNCONFIRMED`, which is what stops that one signing in, and
 * reaches `CONFIRMED` through `ConfirmSignUp` or `AdminConfirmSignUp`. A user
 * an admin sent to `AdminResetUserPassword` is `RESET_REQUIRED` until it sets
 * a password of its own again. A user the pool created for a federated sign-in
 * is `EXTERNAL_PROVIDER` and stays there, because its password is at the
 * provider rather than in the pool. `ARCHIVED`, `COMPROMISED` and `UNKNOWN`
 * belong to threat protection and to accounts Cognito has retired, neither of
 * which is simulated.
 */
export class SimCognitoUserStatus {
  /**
   * The status a user that signed itself up starts in.
   */
  public static readonly unconfirmed = new SimCognitoUserStatus("UNCONFIRMED");

  /**
   * The status a user created by an admin starts in.
   */
  public static readonly forceChangePassword = new SimCognitoUserStatus(
    "FORCE_CHANGE_PASSWORD",
  );

  /**
   * The status a user with a password of its own reaches.
   */
  public static readonly confirmed = new SimCognitoUserStatus("CONFIRMED");

  /**
   * The status a user whose password an administrator reset waits in.
   *
   * The user cannot sign in from here. It has a code to answer
   * `ConfirmForgotPassword` with, and setting a password that way is what
   * takes it back to `CONFIRMED`.
   */
  public static readonly resetRequired = new SimCognitoUserStatus(
    "RESET_REQUIRED",
  );

  /**
   * The status a user created by a federated sign-in stays in.
   *
   * Such a user has no password in the pool, so nothing moves it on: it signs
   * in at its provider each time, and the pool's own sign-in flows refuse it,
   * as they do on real Cognito.
   */
  public static readonly externalProvider = new SimCognitoUserStatus(
    "EXTERNAL_PROVIDER",
  );

  public readonly value: SimCognitoUserStatusValue;

  private constructor(value: SimCognitoUserStatusValue) {
    this.value = value;
  }

  /**
   * The status a user reaches when an admin sets a password on it.
   *
   * A permanent password is the user's own, so the user is confirmed and can
   * sign in with it. A temporary one leaves the user having to replace it,
   * which is the same place `AdminCreateUser` leaves a new user. An
   * `UNCONFIRMED` user reaches the same two, as it does on real Cognito:
   * setting a permanent password on one confirms it without a code.
   */
  static afterPasswordSet(
    permanent: boolean | undefined,
  ): SimCognitoUserStatus {
    if (permanent === true) {
      return this.confirmed;
    }

    return this.forceChangePassword;
  }

  /**
   * Whether the user has to replace its password before it can sign in.
   *
   * This is what turns an authentication into the `NEW_PASSWORD_REQUIRED`
   * challenge rather than into tokens.
   */
  get mustChangePassword(): boolean {
    return this.value === "FORCE_CHANGE_PASSWORD";
  }

  /**
   * Whether the user has to set a password of its own before it can sign in.
   *
   * This is what turns an authentication into `PasswordResetRequiredException`
   * rather than into tokens, and it is the whole point of the status: an
   * administrator has taken the user's password away, and only the user can
   * choose the next one.
   */
  get mustResetPassword(): boolean {
    return this.value === "RESET_REQUIRED";
  }

  /**
   * Whether the user has still to confirm the sign-up it made.
   *
   * This is what turns an authentication into `UserNotConfirmedException`,
   * which real Cognito answers with even when the password was right.
   */
  get isUnconfirmed(): boolean {
    return this.value === "UNCONFIRMED";
  }

  /**
   * Whether a user in this status is holding a code it has still to answer
   * with.
   *
   * A user waiting to confirm its sign-up holds the code its pool issued, and
   * one an administrator has reset holds the code it sets a new password with.
   * Nothing else has anything outstanding.
   */
  get holdsCode(): boolean {
    return this.isUnconfirmed || this.mustResetPassword;
  }

  /**
   * Refuse to confirm a user that is not waiting to be confirmed.
   *
   * Real Cognito says which status stopped it, because the answer to a user
   * already `CONFIRMED` is to sign it in and the answer to one in
   * `FORCE_CHANGE_PASSWORD` is the new password challenge.
   */
  requireConfirmable(): void {
    if (!this.isUnconfirmed) {
      throw new SimCognitoNotAuthorizedException(
        `User cannot be confirmed. Current status is ${this.value}`,
      );
    }
  }

  /**
   * Refuse a `ForgotPassword` or `ConfirmForgotPassword` for a user that
   * cannot reset its own password.
   *
   * A user still on a temporary password is refused here and not by
   * `AdminResetUserPassword`: it has the `NEW_PASSWORD_REQUIRED` challenge to
   * answer, so real Cognito sends it to that rather than to a reset code.
   */
  requireSelfResettable(): void {
    this.requireResettable();

    if (this.mustChangePassword) {
      throw new SimCognitoNotAuthorizedException(
        "User password cannot be reset in the current state.",
      );
    }
  }

  /**
   * Refuse a password reset for a user that has no password in this pool.
   *
   * A federated user signs in at its provider, so there is nothing here to
   * reset and nothing a code could set, whoever asked for the reset.
   */
  requireResettable(): void {
    if (this.value === "EXTERNAL_PROVIDER") {
      throw new SimCognitoNotAuthorizedException(
        "User password cannot be reset in the current state.",
      );
    }
  }

  /**
   * Refuse to issue another confirmation code to a user that needs none.
   *
   * Real Cognito reports this as a bad request rather than as a refusal to
   * confirm, because nothing was wrong with the user: there is simply no
   * sign-up left to confirm.
   */
  requireResendable(): void {
    if (!this.isUnconfirmed) {
      throw new SimCognitoInvalidParameterException(
        `User is already confirmed: its status is ${this.value}, so there ` +
          `is no sign-up left to confirm.`,
      );
    }
  }
}
