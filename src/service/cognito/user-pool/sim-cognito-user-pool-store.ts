import {
  SimCognitoNotAuthorizedException,
  SimCognitoResourceNotFoundException,
} from "../error/sim-cognito.error.js";
import { SimCognitoDomainRegistry } from "../registry/sim-cognito-domain-registry.js";
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

  /**
   * Where hosted domains are indexed, so a deleted pool's domain stops
   * resolving and its name goes back into use.
   */
  readonly domains?: SimCognitoDomainRegistry;
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
  private readonly domains: SimCognitoDomainRegistry;

  constructor(properties: SimCognitoUserPoolStoreProperties = {}) {
    this.registry = properties.registry ?? new SimCognitoUserPoolRegistry();
    this.domains = properties.domains ?? new SimCognitoDomainRegistry();
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
   * Forget a deleted pool, and with it the domain it was served on.
   *
   * Deleting a pool takes its domain with it on real Cognito, which is what
   * frees the domain string for another pool.
   */
  remove(pool: SimCognitoUserPool): void {
    this.pools.delete(pool.id);
    this.registry.deregister(pool);

    const { domain } = pool.auth;

    if (domain !== undefined) {
      this.domains.deregister(domain);
    }
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
    const found = this.findClient(clientId);

    if (found === undefined) {
      throw new SimCognitoResourceNotFoundException(
        `App client ${clientId} does not exist.`,
      );
    }

    return found;
  }

  /**
   * Find an app client by id alone, and the pool holding it.
   *
   * This is the same search `requireClient` makes, for a caller that has
   * something to do with the absence. Registering a client under a chosen id
   * uses it to keep one client id out of two pools.
   */
  findClient(
    clientId: SimCognitoUserPoolClientId,
  ): SimCognitoClientInPool | undefined {
    for (const pool of this.all) {
      const client = pool.findClient(clientId);

      if (client !== undefined) {
        return { pool, client };
      }
    }

    return undefined;
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
