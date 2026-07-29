import type { SimClock } from "../../../../util/clock/sim-clock.js";
import { SimCognitoName } from "../sim-cognito-name.js";
import type { SimCognitoUserPool } from "../sim-cognito-user-pool.js";
import { makeSimCognitoClientSecret } from "./sim-cognito-client-secret.js";
import { SimCognitoExplicitAuthFlows } from "./sim-cognito-explicit-auth-flows.js";
import { SimCognitoPreventUserExistenceErrors } from "./sim-cognito-prevent-user-existence-errors.js";
import {
  SimCognitoTokenValidity,
  type SimCognitoTokenValidityInput,
} from "./sim-cognito-token-validity.js";
import { SimCognitoUserPoolClient } from "./sim-cognito-user-pool-client.js";
import { makeSimCognitoUserPoolClientId } from "./sim-cognito-user-pool-client-id.js";

interface SimCognitoUserPoolClientFactoryProperties {
  readonly clock: SimClock;
}

interface SimCognitoMakeUserPoolClientProperties {
  readonly pool: SimCognitoUserPool;
  readonly name: string | undefined;
  readonly generateSecret?: boolean | undefined;
  readonly explicitAuthFlows?: readonly string[] | undefined;
  readonly preventUserExistenceErrors?: string | undefined;
  readonly tokenValidity: SimCognitoTokenValidityInput;
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
      name: new SimCognitoName({
        field: "ClientName",
        value: properties.name,
      }),
      secret: this.secretFor(properties.generateSecret),
      explicitAuthFlows: new SimCognitoExplicitAuthFlows(
        properties.explicitAuthFlows,
      ),
      preventUserExistenceErrors: new SimCognitoPreventUserExistenceErrors(
        properties.preventUserExistenceErrors,
      ),
      tokenValidity: new SimCognitoTokenValidity(properties.tokenValidity),
      createdDate: this.clock.now(),
    });
  }

  private secretFor(generateSecret: boolean | undefined): string | undefined {
    if (generateSecret !== true) {
      return undefined;
    }

    return makeSimCognitoClientSecret();
  }
}
