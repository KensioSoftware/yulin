import { SimCognitoUserPoolAlreadyExists } from "../error/sim-cognito.error.js";
import type { SimCognitoUserPoolRegistration } from "./sim-cognito-registration.types.js";
import type { SimCognitoUserPool } from "./sim-cognito-user-pool.js";
import type { SimCognitoUserPoolFactory } from "./sim-cognito-user-pool-factory.js";
import { requireSimCognitoUserPoolIdInRegion } from "./sim-cognito-user-pool-id.js";
import type { SimCognitoUserPoolStore } from "./sim-cognito-user-pool-store.js";

interface RegisterSimCognitoUserPoolProperties {
  readonly regionName: string;
  readonly pools: SimCognitoUserPoolStore;
  readonly poolFactory: SimCognitoUserPoolFactory;
}

/**
 * Register a user pool the simulation is told already exists.
 *
 * Real Cognito allocates a pool id, so nothing on the command surface takes
 * one. A CDK app that creates its pool in one stack and reads it from another
 * carries the id across as a literal string, and every template naming it
 * deploys against an id the simulation never chose. This is how a simulation
 * comes to own that id before the template deploys.
 *
 * The pool goes through the same factory a created one does, so it gets the
 * same ARN, the same settings defaults, and the same place in the cross-Account
 * registry that serves its JWKS.
 */
export function registerSimCognitoUserPool(
  registration: SimCognitoUserPoolRegistration,
  properties: RegisterSimCognitoUserPoolProperties,
): SimCognitoUserPool {
  const { pools } = properties;
  const userPoolId = requireSimCognitoUserPoolIdInRegion(
    registration.id,
    properties.regionName,
  );

  if (pools.ids.has(userPoolId)) {
    throw new SimCognitoUserPoolAlreadyExists(
      `A sim Cognito user pool with id ${userPoolId} already exists`,
    );
  }

  const pool = properties.poolFactory.make({
    id: userPoolId,
    name: registration.name,
    settings: registration.settings ?? {},
  });

  pools.add(pool);

  return pool;
}
