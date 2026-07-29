import { SimCognitoResourceNotFoundException } from "../../error/sim-cognito.error.js";
import type { SimCognitoUserPoolClient } from "./sim-cognito-user-pool-client.js";
import type { SimCognitoUserPoolClientId } from "./sim-cognito-user-pool-client-id.js";

/**
 * The app clients of one simulated user pool.
 *
 * Clients belong to a pool rather than to an account: a client id is only
 * meaningful alongside the pool id it was created in, which is why every app
 * client operation takes both.
 */
export class SimCognitoUserPoolClientStore {
  private readonly clients = new Map<string, SimCognitoUserPoolClient>();

  /**
   * Every app client of this pool, in creation order.
   */
  get all(): readonly SimCognitoUserPoolClient[] {
    return this.clients.values().toArray();
  }

  /**
   * The ids already in use, so a new one can avoid them.
   */
  get ids(): Set<string> {
    return new Set(this.clients.keys());
  }

  /**
   * Store a newly created app client.
   */
  add(client: SimCognitoUserPoolClient): void {
    this.clients.set(client.id, client);
  }

  /**
   * Forget a deleted app client.
   */
  remove(client: SimCognitoUserPoolClient): void {
    this.clients.delete(client.id);
  }

  /**
   * Find an app client by id.
   */
  find(clientId: string): SimCognitoUserPoolClient | undefined {
    return this.clients.get(clientId);
  }

  /**
   * Resolve an app client by id, or refuse.
   */
  require(clientId: SimCognitoUserPoolClientId): SimCognitoUserPoolClient {
    const found = this.find(clientId);

    if (found === undefined) {
      throw new SimCognitoResourceNotFoundException(
        `App client ${clientId} does not exist.`,
      );
    }

    return found;
  }
}
