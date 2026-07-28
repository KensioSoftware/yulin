import { SimCognitoResourceNotFoundException } from "../error/sim-cognito.error.js";
import type { SimCognitoUserPool } from "./sim-cognito-user-pool.js";
import type { SimCognitoUserPoolId } from "./sim-cognito-user-pool-id.js";

/**
 * The user pools of one simulated Cognito scope.
 *
 * Pools are keyed by id rather than by name, as real Cognito keys them: two
 * pools may share a name, and only the id ever identifies one.
 */
export class SimCognitoUserPoolStore {
  private readonly pools = new Map<string, SimCognitoUserPool>();

  /**
   * Every pool in this scope, in creation order.
   */
  get all(): readonly SimCognitoUserPool[] {
    return this.pools.values().toArray();
  }

  /**
   * The pool ids already in use, so a new one can avoid them.
   */
  get ids(): Set<string> {
    return new Set(this.pools.keys());
  }

  /**
   * Store a newly created pool.
   */
  add(pool: SimCognitoUserPool): void {
    this.pools.set(pool.id, pool);
  }

  /**
   * Forget a deleted pool.
   */
  remove(pool: SimCognitoUserPool): void {
    this.pools.delete(pool.id);
  }

  /**
   * Find a pool by id.
   */
  find(userPoolId: SimCognitoUserPoolId): SimCognitoUserPool | undefined {
    return this.pools.get(userPoolId);
  }

  /**
   * Resolve a pool by id, or refuse.
   */
  require(userPoolId: SimCognitoUserPoolId): SimCognitoUserPool {
    const found = this.find(userPoolId);

    if (found === undefined) {
      throw new SimCognitoResourceNotFoundException(
        `User pool ${userPoolId} does not exist.`,
      );
    }

    return found;
  }
}
