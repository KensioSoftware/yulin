import type { SimClock } from "../../../../util/clock/sim-clock.js";
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
  readonly clock: SimClock;
}

/**
 * One simulated Cognito user.
 *
 * The user's `sub` is a UUID Cognito allocates, and is not the username. Code
 * that keys on the wrong one works only while the two happen to match, which
 * they never do on a real pool.
 *
 * A user starts in `FORCE_CHANGE_PASSWORD`, because `AdminCreateUser` is the
 * only way to make one here. That is the status that stops a user signing in
 * with the temporary password it was given.
 */
export class SimCognitoUser {
  public readonly username: SimCognitoUsername;
  public readonly sub: string;
  public readonly creationDate: Date;

  private readonly clock: SimClock;
  private readonly userAttributes: SimCognitoUserAttributes;
  private userStatus = SimCognitoUserStatus.forceChangePassword;
  private userPassword: SimCognitoUserPassword | undefined;
  private isEnabled = true;
  private modifiedDate: Date;

  constructor(properties: SimCognitoUserProperties) {
    this.username = properties.username;
    this.sub = properties.sub;
    this.userAttributes = properties.attributes;
    this.userPassword = properties.password;
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
   * Set the password an admin gave this user.
   *
   * A permanent password is the user's own, and confirms it. A temporary one
   * leaves the user in `FORCE_CHANGE_PASSWORD`, having to replace it through
   * the `NEW_PASSWORD_REQUIRED` challenge before it can sign in normally.
   */
  setPassword(password: string, permanent: boolean | undefined): void {
    this.userPassword = new SimCognitoUserPassword(password);
    this.userStatus = SimCognitoUserStatus.afterPasswordSet(permanent);
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

  private touch(): void {
    this.modifiedDate = this.clock.now();
  }
}
