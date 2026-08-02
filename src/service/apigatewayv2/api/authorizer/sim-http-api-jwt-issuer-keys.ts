import { SimJwtKeys } from "../../../../util/jwt/sim-jwt-keys.js";

/**
 * The signing keys an issuer publishes, as a JWT authorizer sees them.
 *
 * A JWT authorizer accepts any OIDC issuer, so this port is how it reaches one
 * without depending on whatever simulated service happens to be that issuer.
 * A standalone SimApiGatewayV2 has the refusing implementation below, which is
 * what makes an authorizer with nothing behind its issuer refuse every token
 * rather than admit one it could not check.
 *
 * Nothing is fetched over HTTP. A pool's published OpenID configuration names
 * the localhost origin it is served from, while its tokens name the real AWS
 * URL, so a discovery client would reject its own issuer's tokens. Resolving
 * in process compares the two strings that both come from the same getter.
 */
export interface SimHttpApiJwtIssuerKeys {
  /**
   * The keys published by the issuer this URL names, which is an empty set
   * when nothing in the simulation issues for it.
   */
  publishedBy(issuerUrl: string): SimJwtKeys;
}

/**
 * The keys available to an API Gateway that has no issuer to ask.
 *
 * Every issuer publishes nothing, so every token fails key selection and every
 * request to a JWT route is refused. That is the safe answer for a simulated
 * API Gateway standing on its own: a route configured to be closed stays
 * closed.
 */
export class SimHttpApiNoJwtIssuerKeys implements SimHttpApiJwtIssuerKeys {
  /**
   * No issuer publishes anything here.
   */
  publishedBy(): SimJwtKeys {
    return new SimJwtKeys([]);
  }
}
