import {
  SimCognitoUsernameExistsException,
  SimCognitoUserNotFoundException,
} from "../../error/sim-cognito.error.js";
import type { SimCognitoUsernameAttributes } from "../sim-cognito-username-attributes.js";
import type { SimCognitoUser } from "./sim-cognito-user.js";
import type { SimCognitoUsername } from "./sim-cognito-username.js";

/**
 * The users of one simulated user pool.
 *
 * Users are keyed by username, which is what every admin operation names one
 * by. Usernames are case sensitive here, as they are on a pool created without
 * a `UsernameConfiguration`, which this simulation refuses.
 *
 * A pool that signs its users in by an attribute keys them by the UUID
 * username Cognito generated, and reaches them by that attribute's value as
 * well: real Cognito resolves the alias for its admin operations and its
 * sign-ins, so a request naming a user by its email finds the same user a
 * request naming the UUID finds. What a pool signs users in by is fixed when
 * the pool is created, which is why this is settled once here.
 */
export class SimCognitoUserStore {
  private readonly users = new Map<string, SimCognitoUser>();
  private readonly signInBy: SimCognitoUsernameAttributes;

  constructor(signInBy: SimCognitoUsernameAttributes) {
    this.signInBy = signInBy;
  }

  /**
   * Every user in this pool, in creation order.
   */
  get all(): readonly SimCognitoUser[] {
    return this.users.values().toArray();
  }

  /**
   * How many users the pool holds.
   */
  get count(): number {
    return this.users.size;
  }

  /**
   * Store a newly created user, refusing a username the pool already holds.
   *
   * A pool signing users in by an attribute refuses a second user holding a
   * value another user signs in by too. That value identifies the account
   * there, so allowing two would leave a sign-in naming an account this pool
   * has two of.
   */
  add(user: SimCognitoUser): void {
    if (this.users.has(user.username)) {
      throw new SimCognitoUsernameExistsException(
        `User account ${user.username} already exists in this user pool.`,
      );
    }

    this.requireSignInValuesFree(user);
    this.users.set(user.username, user);
  }

  /**
   * Forget a deleted user.
   */
  remove(user: SimCognitoUser): void {
    this.users.delete(user.username);
  }

  /**
   * Find a user by username, or by a value the pool signs users in by.
   */
  find(username: string): SimCognitoUser | undefined {
    return this.users.get(username) ?? this.findBySignInValue(username);
  }

  /**
   * Resolve a user by username, or refuse.
   */
  require(username: SimCognitoUsername): SimCognitoUser {
    const found = this.find(username);

    if (found === undefined) {
      throw new SimCognitoUserNotFoundException(this.missingMessage(username));
    }

    return found;
  }

  /**
   * Find the user signing in by a value, where the pool signs users in by an
   * attribute at all.
   */
  private findBySignInValue(value: string): SimCognitoUser | undefined {
    if (this.signInBy.isEmpty) {
      return undefined;
    }

    return this.all.find((user) =>
      this.signInBy.matches(user.attributeValues, value),
    );
  }

  /**
   * Refuse a user signing in by a value another user already signs in by.
   */
  private requireSignInValuesFree(user: SimCognitoUser): void {
    for (const [name, value] of this.signInBy.signInValues(
      user.attributeValues,
    )) {
      if (this.findBySignInValue(value) !== undefined) {
        throw new SimCognitoUsernameExistsException(
          `An account with the given ${name} already exists.`,
        );
      }
    }
  }

  /**
   * Say why a username reached no user.
   *
   * A value that is some user's `sub` gets its own message. Real Cognito
   * accepts a `sub` where an admin operation asks for a username, and this
   * simulation resolves users by username only, so the refusal explains
   * itself rather than looking like the user was never created.
   */
  private missingMessage(username: SimCognitoUsername): string {
    const bySub = this.all.find((user) => user.sub === username);

    if (bySub !== undefined) {
      return (
        `User ${username} does not exist: that is the sub of user ` +
        `${bySub.username}. Real Cognito also accepts a sub where an admin ` +
        `operation asks for a username, and this simulation resolves users ` +
        `by username only.`
      );
    }

    return `User ${username} does not exist.`;
  }
}
