export type SimCognitoUserStatusValue = "FORCE_CHANGE_PASSWORD" | "CONFIRMED";

/**
 * The status of one simulated user.
 *
 * Only the two statuses this simulation can reach are modelled. A user created
 * by `AdminCreateUser` starts in `FORCE_CHANGE_PASSWORD`, which is what stops
 * it signing in normally on real Cognito, and reaches `CONFIRMED` when an
 * admin sets a permanent password on it. The other real statuses
 * (`UNCONFIRMED`, `RESET_REQUIRED`, `EXTERNAL_PROVIDER` and the rest) belong
 * to sign-up, password resets and federation, none of which are simulated.
 */
export class SimCognitoUserStatus {
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
   * which is the same place `AdminCreateUser` leaves a new user.
   */
  static afterPasswordSet(
    permanent: boolean | undefined,
  ): SimCognitoUserStatus {
    if (permanent === true) {
      return this.confirmed;
    }

    return this.forceChangePassword;
  }
}
