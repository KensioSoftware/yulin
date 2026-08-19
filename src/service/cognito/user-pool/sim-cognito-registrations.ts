import { registerSimCognitoUserPoolClient } from "./register-sim-cognito-user-pool-client.js";
import { registerSimCognitoUserPool } from "./register-sim-cognito-user-pool.js";
import type { SimCognitoUserPoolClientFactory } from "./client/sim-cognito-user-pool-client-factory.js";
import type { SimCognitoUserPoolClient } from "./client/sim-cognito-user-pool-client.js";
import type {
  SimCognitoUserPoolClientRegistration,
  SimCognitoUserPoolRegistration,
} from "./sim-cognito-registration.types.js";
import type { SimCognitoUserPool } from "./sim-cognito-user-pool.js";
import type { SimCognitoUserPoolFactory } from "./sim-cognito-user-pool-factory.js";
import type { SimCognitoUserPoolStore } from "./sim-cognito-user-pool-store.js";

interface SimCognitoRegistrationsProperties {
  /** The Region a pool registered here has to name in its id. */
  readonly regionName: string;

  readonly pools: SimCognitoUserPoolStore;
  readonly poolFactory: SimCognitoUserPoolFactory;
  readonly clientFactory: SimCognitoUserPoolClientFactory;
}

/**
 * The user pools and app clients a simulation is told already exist.
 *
 * These are the simulator's own setup operations rather than AWS ones, so they
 * skip the command surface and its authorization, as `mountBucketFilesystem`
 * and `registerHostedZone` do.
 */
export class SimCognitoRegistrations {
  constructor(private readonly properties: SimCognitoRegistrationsProperties) {}

  /**
   * Register a user pool under a chosen pool id.
   */
  userPool(registration: SimCognitoUserPoolRegistration): SimCognitoUserPool {
    return registerSimCognitoUserPool(registration, this.properties);
  }

  /**
   * Register an app client of a pool under a chosen client id.
   */
  userPoolClient(
    registration: SimCognitoUserPoolClientRegistration,
  ): SimCognitoUserPoolClient {
    return registerSimCognitoUserPoolClient(registration, this.properties);
  }
}
