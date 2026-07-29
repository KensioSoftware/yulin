import {
  SimCognitoUsernameExistsException,
  SimCognitoUserNotFoundException,
} from "../../error/sim-cognito.error.js";
import type { SimCognitoUser } from "./sim-cognito-user.js";
import type { SimCognitoUsername } from "./sim-cognito-username.js";

/**
 * The users of one simulated user pool.
 *
 * Users are keyed by username, which is what every admin operation names one
 * by. Usernames are case sensitive here, as they are on a pool created without
 * a `UsernameConfiguration`, which this simulation refuses.
 */
export class SimCognitoUserStore {
  private readonly users = new Map<string, SimCognitoUser>();

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
   */
  add(user: SimCognitoUser): void {
    if (this.users.has(user.username)) {
      throw new SimCognitoUsernameExistsException(
        `User account ${user.username} already exists in this user pool.`,
      );
    }

    this.users.set(user.username, user);
  }

  /**
   * Forget a deleted user.
   */
  remove(user: SimCognitoUser): void {
    this.users.delete(user.username);
  }

  /**
   * Find a user by username.
   */
  find(username: string): SimCognitoUser | undefined {
    return this.users.get(username);
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
