import {
  SimCognitoNotAuthorizedException,
  SimCognitoResourceNotFoundException,
} from "../error/sim-cognito.error.js";
import { SimCognitoUserPoolRegistry } from "../registry/sim-cognito-user-pool-registry.js";
import type { SimCognitoIssuedToken } from "./auth/sim-cognito-issued-token.js";
import type { SimCognitoUserPoolClient } from "./client/sim-cognito-user-pool-client.js";
import type { SimCognitoUserPoolClientId } from "./client/sim-cognito-user-pool-client-id.js";
import type { SimCognitoUserPool } from "./sim-cognito-user-pool.js";
import type { SimCognitoUserPoolId } from "./sim-cognito-user-pool-id.js";

/**
 * An app client, and the pool that issued its id.
 */
export interface SimCognitoClientInPool {
  readonly pool: SimCognitoUserPool;
  readonly client: SimCognitoUserPoolClient;
}

/**
 * An access token, and the pool that signed it.
 */
export interface SimCognitoAccessTokenInPool {
  readonly pool: SimCognitoUserPool;
  readonly token: SimCognitoIssuedToken;
}

interface SimCognitoUserPoolStoreProperties {
  readonly registry?: SimCognitoUserPoolRegistry;
}

/**
 * The user pools of one simulated Cognito scope.
 *
 * Pools are keyed by id rather than by name, as real Cognito keys them: two
 * pools may share a name, and only the id ever identifies one.
 *
 * A store also keeps the simulation-wide registry up to date, because a pool
 * id has to be unique beyond this one scope and the serving layer resolves a
 * pool from its id alone.
 */
export class SimCognitoUserPoolStore {
  private readonly pools = new Map<string, SimCognitoUserPool>();
  private readonly registry: SimCognitoUserPoolRegistry;

  constructor(properties: SimCognitoUserPoolStoreProperties = {}) {
    this.registry = properties.registry ?? new SimCognitoUserPoolRegistry();
  }

  private static unexpired(
    issued: SimCognitoIssuedToken,
    now: Date,
  ): SimCognitoIssuedToken {
    if (issued.isExpiredAt(now)) {
      throw new SimCognitoNotAuthorizedException("Access Token has expired.");
    }

    return issued;
  }

  /**
   * Every pool in this scope, in creation order.
   */
  get all(): readonly SimCognitoUserPool[] {
    return this.pools.values().toArray();
  }

  /**
   * The pool ids already in use, so a new one can avoid them.
   *
   * These come from the whole simulation rather than from this scope, because
   * a pool id is what the serving layer looks a pool up by and two Accounts
   * sharing one would be ambiguous.
   */
  get ids(): Set<string> {
    return this.registry.ids;
  }

  /**
   * Store a newly created pool.
   */
  add(pool: SimCognitoUserPool): void {
    this.pools.set(pool.id, pool);
    this.registry.register(pool);
  }

  /**
   * Forget a deleted pool.
   */
  remove(pool: SimCognitoUserPool): void {
    this.pools.delete(pool.id);
    this.registry.deregister(pool);
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

  /**
   * Resolve an app client by id alone, and the pool holding it, or refuse.
   *
   * `InitiateAuth` names no pool, because an app client id is enough to find
   * one on real Cognito, so this is the lookup the client-side flows start
   * from.
   */
  requireClient(clientId: SimCognitoUserPoolClientId): SimCognitoClientInPool {
    for (const pool of this.all) {
      const client = pool.findClient(clientId);

      if (client !== undefined) {
        return { pool, client };
      }
    }

    throw new SimCognitoResourceNotFoundException(
      `App client ${clientId} does not exist.`,
    );
  }

  /**
   * Resolve the access token a request is authorized with, and the pool that
   * signed it, or refuse.
   *
   * `GlobalSignOut` names no pool either: the token is what says which pool
   * the request is for. A token from a signed-out session has been forgotten
   * by then, which is what real Cognito reports as a revoked access token.
   */
  requireAccessToken(value: string, now: Date): SimCognitoAccessTokenInPool {
    for (const pool of this.all) {
      const issued = pool.auth.findAccessToken(value);

      if (issued !== undefined) {
        return { pool, token: SimCognitoUserPoolStore.unexpired(issued, now) };
      }
    }

    throw new SimCognitoNotAuthorizedException(
      "Access Token has been revoked.",
    );
  }
}
