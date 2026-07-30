import type { SimCognitoUserPool } from "../user-pool/sim-cognito-user-pool.js";
import type { SimCognitoUserPoolId } from "../user-pool/sim-cognito-user-pool-id.js";

/**
 * Simulated Cognito cross-Account registry of user pools.
 *
 * A served JWKS request carries the region in its hostname and the pool id in
 * its path, and says nothing about the Account. Simulated Cognito state is per
 * Account/Region, so the serving layer needs a way from a pool id to the pool
 * that has it. This registry is that lookup, which is also why pool ids are
 * allocated against it and are unique across every Account and Region of one
 * simulated AWS environment.
 */
export class SimCognitoUserPoolRegistry {
  private readonly poolsById = new Map<
    SimCognitoUserPoolId,
    SimCognitoUserPool
  >();

  /**
   * The pool ids already in use in this simulated AWS.
   */
  get ids(): Set<string> {
    return new Set(this.poolsById.keys());
  }

  /**
   * Register a newly created pool, so its public endpoints resolve.
   */
  register(pool: SimCognitoUserPool): void {
    this.poolsById.set(pool.id, pool);
  }

  /**
   * Forget a deleted pool, so its public endpoints stop resolving.
   */
  deregister(pool: SimCognitoUserPool): void {
    this.poolsById.delete(pool.id);
  }

  /**
   * Find a pool by id, in whichever Account and Region created it.
   */
  find(userPoolId: string): SimCognitoUserPool | undefined {
    return this.poolsById.get(userPoolId as SimCognitoUserPoolId);
  }
}
