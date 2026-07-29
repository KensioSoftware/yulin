import type { SimClock } from "../../../../util/clock/sim-clock.js";
import type { SimCognitoUserPoolId } from "../sim-cognito-user-pool-id.js";
import type { SimCognitoGroupName } from "./sim-cognito-group-name.js";
import type { SimCognitoGroupSettings } from "./sim-cognito-group-settings.js";

interface SimCognitoGroupProperties {
  readonly name: SimCognitoGroupName;
  readonly userPoolId: SimCognitoUserPoolId;
  readonly settings: SimCognitoGroupSettings;
  readonly clock: SimClock;
}

/**
 * One simulated Cognito group, and the users in it.
 *
 * The group holds its members rather than each user holding its groups,
 * because that is the direction deletion runs: deleting a group takes its
 * membership with it, and leaves the users alone.
 *
 * `Precedence` is the property that matters most. It decides the order the
 * `cognito:groups` claim will list a user's groups in, and which group's role
 * reaches the `cognito:preferred_role` claim. Zero is the strongest, and a
 * group with no precedence is weaker than any group that has one.
 */
export class SimCognitoGroup {
  public readonly name: SimCognitoGroupName;
  public readonly userPoolId: SimCognitoUserPoolId;
  public readonly creationDate: Date;

  private readonly clock: SimClock;
  private readonly members = new Set<string>();
  private groupSettings: SimCognitoGroupSettings;
  private modifiedDate: Date;

  constructor(properties: SimCognitoGroupProperties) {
    this.name = properties.name;
    this.userPoolId = properties.userPoolId;
    this.groupSettings = properties.settings;
    this.clock = properties.clock;
    this.creationDate = this.clock.now();
    this.modifiedDate = this.creationDate;
  }

  /**
   * What the group is for, if the request that made it said.
   */
  get description(): string | undefined {
    return this.groupSettings.description;
  }

  /**
   * Where this group sits against the others a user may belong to, if it has
   * a precedence at all.
   */
  get precedence(): number | undefined {
    return this.groupSettings.precedence;
  }

  /**
   * The IAM role a member of this group prefers, if the group has one.
   *
   * Nothing here assumes that role. It reaches the token claims, which are
   * not simulated yet, and identity pools, which are not simulated at all.
   */
  get roleArn(): string | undefined {
    return this.groupSettings.roleArn;
  }

  /**
   * When the group's properties last changed.
   */
  get lastModifiedDate(): Date {
    return this.modifiedDate;
  }

  /**
   * Replace the group's properties.
   *
   * `UpdateGroup` replaces all three rather than merging: real Cognito does
   * not say which it does, and a request naming every property is the one
   * thing that behaves the same either way.
   */
  update(settings: SimCognitoGroupSettings): void {
    this.groupSettings = settings;
    this.modifiedDate = this.clock.now();
  }

  /**
   * Put a user in this group.
   *
   * Adding a user already in the group changes nothing and is not an error,
   * as it is not on real Cognito.
   */
  addMember(username: string): void {
    this.members.add(username);
  }

  /**
   * Take a user out of this group, whether or not they were in it.
   */
  removeMember(username: string): void {
    this.members.delete(username);
  }

  /**
   * Whether a user is in this group.
   */
  hasMember(username: string): boolean {
    return this.members.has(username);
  }
}
