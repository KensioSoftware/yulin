import type { SimClock } from "../../../../util/clock/sim-clock.js";
import { SimCognitoUserConfirmation } from "./sim-cognito-user-confirmation.js";
import type {
  SimCognitoAttributeType,
  SimCognitoUserAttributes,
} from "./sim-cognito-user-attributes.js";
import { SimCognitoUserPassword } from "./sim-cognito-user-password.js";
import { SimCognitoUserStatus } from "./sim-cognito-user-status.js";
import type { SimCognitoUsername } from "./sim-cognito-username.js";

interface SimCognitoUserProperties {
  readonly username: SimCognitoUsername;
  readonly sub: string;
  readonly attributes: SimCognitoUserAttributes;
  readonly password?: SimCognitoUserPassword | undefined;

  /**
   * Where the user starts. `AdminCreateUser` leaves one in
   * `FORCE_CHANGE_PASSWORD`, which is the default, and `SignUp` leaves one in
   * `UNCONFIRMED`.
   */
  readonly status?: SimCognitoUserStatus | undefined;
  readonly clock: SimClock;
}

/**
 * One simulated Cognito user.
 *
 * The user's `sub` is a UUID Cognito allocates, and is not the username. Code
 * that keys on the wrong one works only while the two happen to match, which
 * they never do on a real pool.
 *
 * Where a user starts depends on how it was made. `AdminCreateUser` leaves one
 * in `FORCE_CHANGE_PASSWORD`, which is the status that stops it signing in
 * with the temporary password it was given, and `SignUp` leaves one in
 * `UNCONFIRMED` holding the confirmation code its pool issued.
 */
export class SimCognitoUser {
  public readonly username: SimCognitoUsername;
  public readonly sub: string;
  public readonly creationDate: Date;

  private readonly clock: SimClock;
  private readonly userAttributes: SimCognitoUserAttributes;
  private readonly confirmation: SimCognitoUserConfirmation;
  private userStatus: SimCognitoUserStatus;
  private userPassword: SimCognitoUserPassword | undefined;
  private isEnabled = true;
  private modifiedDate: Date;

  constructor(properties: SimCognitoUserProperties) {
    this.username = properties.username;
    this.sub = properties.sub;
    this.userAttributes = properties.attributes;
    this.userPassword = properties.password;
    this.userStatus =
      properties.status ?? SimCognitoUserStatus.forceChangePassword;
    this.confirmation = new SimCognitoUserConfirmation(this.userStatus);
    this.clock = properties.clock;
    this.creationDate = this.clock.now();
    this.modifiedDate = this.creationDate;
  }

  /**
   * When the user last changed.
   */
  get lastModifiedDate(): Date {
    return this.modifiedDate;
  }

  /**
   * Where the user is in the status lifecycle.
   */
  get status(): SimCognitoUserStatus {
    return this.userStatus;
  }

  /**
   * Whether the user may authenticate at all.
   *
   * A disabled user keeps its password and its attributes, and neither real
   * Cognito nor this simulation signs it in. A refresh is refused too, so
   * disabling a user ends the sessions it has rather than only stopping new
   * ones.
   */
  get enabled(): boolean {
    return this.isEnabled;
  }

  /**
   * The user's attributes, with the `sub` Cognito allocated among them.
   *
   * Real Cognito reports `sub` alongside the attributes a request set, which
   * is where most code reads a user's identifier from.
   */
  get attributes(): readonly SimCognitoAttributeType[] {
    return [{ Name: "sub", Value: this.sub }, ...this.userAttributes.entries];
  }

  /**
   * The user's attributes by name, without the `sub` Cognito allocated.
   *
   * This is what an id token's claims are built from: every attribute there
   * has a value, and the sub is a claim of its own.
   */
  get attributeValues(): ReadonlyMap<string, string> {
    return this.userAttributes.values;
  }

  /**
   * The confirmation code this user has outstanding, if it has one.
   *
   * Real Cognito sends the code to the user and never reports it back. Nothing
   * here delivers a message, so a test reads the code from the pool instead,
   * which is the divergence that makes a sign-up flow testable at all. A
   * confirmed user has none: a code is single use, and confirming spends it.
   */
  get confirmationCode(): string | undefined {
    return this.confirmation.code;
  }

  /**
   * Set the password an admin gave this user.
   *
   * A permanent password is the user's own, and confirms it. A temporary one
   * leaves the user in `FORCE_CHANGE_PASSWORD`, having to replace it through
   * the `NEW_PASSWORD_REQUIRED` challenge before it can sign in normally.
   */
  setPassword(password: string, permanent: boolean | undefined): void {
    this.userPassword = new SimCognitoUserPassword(password);
    this.moveTo(SimCognitoUserStatus.afterPasswordSet(permanent));
  }

  /**
   * Issue a fresh confirmation code, forgetting the one this user had.
   *
   * `ResendConfirmationCode` issues another one rather than sending the same
   * one again, as real Cognito does, so a code read before the resend no
   * longer confirms anything.
   */
  resendConfirmationCode(): void {
    this.userStatus.requireResendable();
    this.confirmation.issue();
    this.touch();
  }

  /**
   * Confirm the sign-up this user made, given the code it was issued.
   *
   * A wrong code leaves the user where it was, still holding the code it was
   * issued, so a caller can try again with the right one.
   */
  confirmSignUp(code: string | undefined): void {
    this.userStatus.requireConfirmable();
    this.confirmation.require(code);
    this.moveTo(SimCognitoUserStatus.confirmed);
  }

  /**
   * Confirm the sign-up without a code, as `AdminConfirmSignUp` does.
   */
  confirm(): void {
    this.userStatus.requireConfirmable();
    this.moveTo(SimCognitoUserStatus.confirmed);
  }

  /**
   * Mark the named attributes verified, where this user has them.
   *
   * This is what a pool's `AutoVerifiedAttributes` reaches when a user
   * confirms its sign-up: the address the code was sent to has been shown to
   * be the user's.
   */
  verifyAttributes(names: readonly string[]): void {
    this.userAttributes.verify(names);
    this.touch();
  }

  /**
   * Whether a candidate password is this user's.
   *
   * A user with no password at all matches nothing. `AdminCreateUser` leaves
   * one that way when the request named no `TemporaryPassword`: real Cognito
   * generates one and sends it to the user, and nothing here delivers a
   * message for the user to read it from.
   */
  hasPassword(candidate: string | undefined): boolean {
    return this.userPassword?.matches(candidate) ?? false;
  }

  /**
   * Apply an attribute update to this user.
   */
  updateAttributes(
    requested: readonly SimCognitoAttributeType[] | undefined,
  ): void {
    this.userAttributes.update(requested);
    this.touch();
  }

  /**
   * Let the user authenticate again.
   */
  enable(): void {
    this.isEnabled = true;
    this.touch();
  }

  /**
   * Stop the user authenticating.
   */
  disable(): void {
    this.isEnabled = false;
    this.touch();
  }

  /**
   * Move the user to a status, and let its confirmation follow.
   *
   * A code confirms one sign-up and no more, so it goes as soon as the user
   * leaves `UNCONFIRMED`, whether it was `ConfirmSignUp` or an admin setting a
   * permanent password that took it there.
   */
  private moveTo(status: SimCognitoUserStatus): void {
    this.userStatus = status;
    this.confirmation.settle(status);
    this.touch();
  }

  private touch(): void {
    this.modifiedDate = this.clock.now();
  }
}
