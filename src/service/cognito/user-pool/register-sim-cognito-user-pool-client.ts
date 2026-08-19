import { SimCognitoUserPoolClientAlreadyExists } from "../error/sim-cognito.error.js";
import type { SimCognitoUserPoolClientFactory } from "./client/sim-cognito-user-pool-client-factory.js";
import { requireSimCognitoUserPoolClientId } from "./client/sim-cognito-user-pool-client-id.js";
import { SimCognitoUserPoolClientSettings } from "./client/sim-cognito-user-pool-client-settings.js";
import type { SimCognitoUserPoolClient } from "./client/sim-cognito-user-pool-client.js";
import type { SimCognitoUserPoolClientRegistration } from "./sim-cognito-registration.types.js";
import { requireSimCognitoUserPoolId } from "./sim-cognito-user-pool-id.js";
import type { SimCognitoUserPoolStore } from "./sim-cognito-user-pool-store.js";

interface RegisterSimCognitoUserPoolClientProperties {
  readonly pools: SimCognitoUserPoolStore;
  readonly clientFactory: SimCognitoUserPoolClientFactory;
}

/**
 * Register an app client of a pool under a chosen client id.
 *
 * A client id is pinned alongside the pool id it belongs to, and real Cognito
 * allocates it the same way, so the two are registered the same way too.
 *
 * The pool has to be there already, whether it was registered or created. A
 * client belongs to a pool, and `CreateUserPoolClient` refuses an unknown pool
 * the same way. The id has to be free across every pool in this simulated
 * Cognito, because `InitiateAuth` finds a pool from a client id alone.
 */
export function registerSimCognitoUserPoolClient(
  registration: SimCognitoUserPoolClientRegistration,
  properties: RegisterSimCognitoUserPoolClientProperties,
): SimCognitoUserPoolClient {
  const { pools } = properties;
  const pool = pools.require(
    requireSimCognitoUserPoolId(registration.userPoolId),
  );
  const clientId = requireSimCognitoUserPoolClientId(registration.id);
  const holder = pools.findClient(clientId);

  if (holder !== undefined) {
    throw new SimCognitoUserPoolClientAlreadyExists(
      `A sim Cognito app client with id ${clientId} is in pool ${holder.pool.id}`,
    );
  }

  const client = properties.clientFactory.make({
    id: clientId,
    pool,
    generateSecret: registration.generateSecret,
    settings: new SimCognitoUserPoolClientSettings({
      ...registration.settings,
      ClientName: registration.name,
    }),
  });

  pool.addClient(client);

  return client;
}
