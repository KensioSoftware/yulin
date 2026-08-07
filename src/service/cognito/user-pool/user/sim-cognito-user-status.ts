import {
  SimCognitoInvalidParameterException,
  SimCognitoNotAuthorizedException,
} from "../../error/sim-cognito.error.js";

export type SimCognitoUserStatusValue =
  | "UNCONFIRMED"
  | "FORCE_CHANGE_PASSWORD"
  | "CONFIRMED";

/**
 * The status of one simulated user.
 *
 * Only the three statuses this simulation can reach are modelled. A user
 * created by `AdminCreateUser` starts in `FORCE_CHANGE_PASSWORD`, which is what
 * stops it signing in normally on real Cognito, and reaches `CONFIRMED` when an
 * admin sets a permanent password on it. A user that signed itself up with
 * `SignUp` starts in `UNCONFIRMED`, which is what stops that one signing in,
 * and reaches `CONFIRMED` through `ConfirmSignUp` or `AdminConfirmSignUp`. The
 * other real statuses (`RESET_REQUIRED`, `EXTERNAL_PROVIDER` and the rest)
 * belong to password resets and federation, neither of which is simulated.
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
   * Whether the user has still to confirm the sign-up it made.
   *
   * This is what turns an authentication into `UserNotConfirmedException`,
   * which real Cognito answers with even when the password was right.
   */
  get isUnconfirmed(): boolean {
    return this.value === "UNCONFIRMED";
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
