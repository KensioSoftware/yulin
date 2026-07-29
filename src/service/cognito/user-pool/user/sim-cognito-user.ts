import type { SimClock } from "../../../../util/clock/sim-clock.js";
import type {
  SimCognitoAttributeType,
  SimCognitoUserAttributes,
} from "./sim-cognito-user-attributes.js";
import { SimCognitoUserStatus } from "./sim-cognito-user-status.js";
import type { SimCognitoUsername } from "./sim-cognito-username.js";

interface SimCognitoUserProperties {
  readonly username: SimCognitoUsername;
  readonly sub: string;
  readonly attributes: SimCognitoUserAttributes;
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
  private isEnabled = true;
  private modifiedDate: Date;

  constructor(properties: SimCognitoUserProperties) {
    this.username = properties.username;
    this.sub = properties.sub;
    this.userAttributes = properties.attributes;
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
   * A disabled user keeps its password and its attributes, and real Cognito
   * refuses to sign it in. Nothing signs in here yet, so this is stored and
   * reported rather than acted on.
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
   * Note that an admin has set a password on this user.
   *
   * The password itself is checked against the pool's policy and not kept,
   * because nothing authenticates here yet. What it changes is the user's
   * status: a permanent password is the user's own, and a temporary one
   * leaves the user having to replace it before it can sign in.
   */
  setPassword(permanent: boolean | undefined): void {
    this.userStatus = SimCognitoUserStatus.afterPasswordSet(permanent);
    this.touch();
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
