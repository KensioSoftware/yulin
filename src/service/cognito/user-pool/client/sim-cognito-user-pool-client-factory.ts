import type { SimClock } from "../../../../util/clock/sim-clock.js";
import type { SimCognitoUserPool } from "../sim-cognito-user-pool.js";
import { makeSimCognitoClientSecret } from "./sim-cognito-client-secret.js";
import { SimCognitoUserPoolClient } from "./sim-cognito-user-pool-client.js";
import { makeSimCognitoUserPoolClientId } from "./sim-cognito-user-pool-client-id.js";
import type { SimCognitoUserPoolClientSettings } from "./sim-cognito-user-pool-client-settings.js";

interface SimCognitoUserPoolClientFactoryProperties {
  readonly clock: SimClock;
}

interface SimCognitoMakeUserPoolClientProperties {
  readonly pool: SimCognitoUserPool;
  readonly generateSecret?: boolean | undefined;
  readonly settings: SimCognitoUserPoolClientSettings;
}

/**
 * Builds simulated app clients, including their id and their secret.
 */
export class SimCognitoUserPoolClientFactory {
  private readonly clock: SimClock;

  constructor(properties: SimCognitoUserPoolClientFactoryProperties) {
    this.clock = properties.clock;
  }

  /**
   * Make a new app client for a pool.
   *
   * A secret is generated only for a request that asked for one, because
   * whether a client has a secret changes what its application has to send:
   * Cognito wants a `SECRET_HASH` on requests from a client that has one.
   */
  make(
    properties: SimCognitoMakeUserPoolClientProperties,
  ): SimCognitoUserPoolClient {
    const { pool } = properties;

    return new SimCognitoUserPoolClient({
      id: makeSimCognitoUserPoolClientId(pool.clientIds),
      userPoolId: pool.id,
      secret: this.secretFor(properties.generateSecret),
      settings: properties.settings,
      clock: this.clock,
    });
  }

  private secretFor(generateSecret: boolean | undefined): string | undefined {
    if (generateSecret !== true) {
      return undefined;
    }

    return makeSimCognitoClientSecret();
  }
}
