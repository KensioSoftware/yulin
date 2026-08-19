import { SimJwtKeys } from "../../../../util/jwt/sim-jwt-keys.js";
import type { SimCognitoUserPoolRegistry } from "../../../cognito/registry/sim-cognito-user-pool-registry.js";
import type {
  SimRestApiUserPool,
  SimRestApiUserPools,
} from "./sim-rest-api-user-pools.js";

interface SimCognitoRestApiUserPoolsProperties {
  readonly userPoolRegistry: SimCognitoUserPoolRegistry;
}

/**
 * Simulated Cognito user pools as the pools a REST API authorizer verifies
 * against.
 *
 * All of the Cognito lookup lives here rather than in API Gateway, which knows
 * only that an authorizer names pools by id. The registry spans simulated
 * Accounts, matching an API Gateway authorizer that can name a pool in any
 * Account.
 */
export class SimCognitoRestApiUserPools implements SimRestApiUserPools {
  private readonly userPoolRegistry: SimCognitoUserPoolRegistry;

  constructor(properties: SimCognitoRestApiUserPoolsProperties) {
    this.userPoolRegistry = properties.userPoolRegistry;
  }

  /**
   * The pool this id names, in whichever Account and Region created it.
   */
  find(userPoolId: string): SimRestApiUserPool | undefined {
    const pool = this.userPoolRegistry.find(userPoolId);

    if (pool === undefined) {
      return undefined;
    }

    return {
      issuerUrl: pool.issuerUrl,
      keys: new SimJwtKeys(pool.jwks().keys),
    };
  }
}
