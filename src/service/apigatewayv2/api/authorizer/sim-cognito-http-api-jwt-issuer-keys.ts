import { SimJwtKeys } from "../../../../util/jwt/sim-jwt-keys.js";
import type { SimCognitoUserPoolRegistry } from "../../../cognito/registry/sim-cognito-user-pool-registry.js";
import type { SimHttpApiJwtIssuerKeys } from "./sim-http-api-jwt-issuer-keys.js";

/**
 * The issuer URL a simulated Cognito user pool's tokens name.
 *
 * The region appears twice, once in the hostname and once as the leading part
 * of the pool id, and real Cognito only issues for a pool through its own
 * region's endpoint. Both are captured so the two can be compared.
 */
const cognitoIssuerUrl =
  /^https:\/\/cognito-idp\.(?<hostRegion>[a-z0-9-]+)\.amazonaws\.com\/(?<poolId>(?<poolRegion>[a-z0-9-]+)_[A-Za-z0-9]+)$/;

interface SimCognitoHttpApiJwtIssuerKeysProperties {
  readonly userPoolRegistry: SimCognitoUserPoolRegistry;
}

/**
 * Simulated Cognito user pools as the issuers a JWT authorizer verifies
 * against.
 *
 * All of the Cognito-shaped URL handling lives here rather than in API
 * Gateway, which knows only that an authorizer names an issuer by URL. The
 * registry spans simulated Accounts, matching an API Gateway authorizer that
 * can name a pool in any Account.
 */
export class SimCognitoHttpApiJwtIssuerKeys implements SimHttpApiJwtIssuerKeys {
  private readonly userPoolRegistry: SimCognitoUserPoolRegistry;

  constructor(properties: SimCognitoHttpApiJwtIssuerKeysProperties) {
    this.userPoolRegistry = properties.userPoolRegistry;
  }

  /**
   * The keys the pool this issuer URL names publishes.
   *
   * An issuer that is not a Cognito URL, names no pool this simulation has, or
   * names one through another region's endpoint publishes nothing, and every
   * token claiming it is refused.
   */
  publishedBy(issuerUrl: string): SimJwtKeys {
    const groups = cognitoIssuerUrl.exec(issuerUrl)?.groups;

    if (groups === undefined || groups["hostRegion"] !== groups["poolRegion"]) {
      return new SimJwtKeys([]);
    }

    const pool = this.userPoolRegistry.find(groups["poolId"] ?? "");

    if (pool === undefined) {
      return new SimJwtKeys([]);
    }

    return new SimJwtKeys(pool.jwks().keys);
  }
}
