import {
  SimCognitoGroupExistsException,
  SimCognitoResourceNotFoundException,
} from "../../error/sim-cognito.error.js";
import type { SimCognitoGroup } from "./sim-cognito-group.js";
import type { SimCognitoGroupName } from "./sim-cognito-group-name.js";

/**
 * The precedence a group with none of its own sorts at.
 *
 * Real Cognito treats a group with no precedence as weaker than any group
 * that has one, and the highest precedence a request can set is `2^31 - 1`.
 */
const weakestPrecedence = Number.MAX_SAFE_INTEGER;

/**
 * The groups of one simulated user pool.
 *
 * Groups are keyed by name, which is what every group operation names one by,
 * and a name is unique within its pool.
 */
export class SimCognitoGroupStore {
  private readonly groups = new Map<string, SimCognitoGroup>();

  /**
   * Every group in this pool, in creation order.
   */
  get all(): readonly SimCognitoGroup[] {
    return this.groups.values().toArray();
  }

  /**
   * Store a newly created group, refusing a name the pool already holds.
   */
  add(group: SimCognitoGroup): void {
    if (this.groups.has(group.name)) {
      throw new SimCognitoGroupExistsException(
        `A group with the name ${group.name} already exists.`,
      );
    }

    this.groups.set(group.name, group);
  }

  /**
   * Forget a deleted group, and with it the membership of its users.
   */
  remove(group: SimCognitoGroup): void {
    this.groups.delete(group.name);
  }

  /**
   * Find a group by name.
   */
  find(groupName: string): SimCognitoGroup | undefined {
    return this.groups.get(groupName);
  }

  /**
   * Resolve a group by name, or refuse.
   */
  require(groupName: SimCognitoGroupName): SimCognitoGroup {
    const found = this.find(groupName);

    if (found === undefined) {
      throw new SimCognitoResourceNotFoundException(
        `Group ${groupName} does not exist.`,
      );
    }

    return found;
  }

  /**
   * The groups a user belongs to, strongest precedence first.
   *
   * This is the order the `cognito:groups` claim will use, so a caller
   * reading the first group gets the one whose role would reach the
   * `cognito:preferred_role` claim. Groups with no precedence come last, and
   * groups sharing one keep the order they were created in.
   */
  forUser(username: string): readonly SimCognitoGroup[] {
    return this.all
      .filter((group) => group.hasMember(username))
      .toSorted(
        (one, other) =>
          (one.precedence ?? weakestPrecedence) -
          (other.precedence ?? weakestPrecedence),
      );
  }

  /**
   * Take a deleted user out of every group.
   */
  forgetUser(username: string): void {
    for (const group of this.all) {
      group.removeMember(username);
    }
  }
}
