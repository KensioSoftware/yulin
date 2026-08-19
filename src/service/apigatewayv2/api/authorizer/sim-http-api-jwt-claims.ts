import type { SimPayload2JwtAuthorizer } from "../../../../serve/payload-2/sim-payload-2-event.type.js";
import { simJwtClaimStrings } from "../../../../util/jwt/sim-jwt-claim-strings.js";
import type { SimJwtClaims } from "../../../../util/jwt/sim-jwt-claims.js";
import { simJwtScopes } from "../../../../util/jwt/sim-jwt-scopes.js";

/**
 * The claims of an accepted token, as an HTTP API hands them to the handler.
 *
 * The rendering is the same one a REST API applies, and lives beside the JWT
 * reader. What is here is the shape a payload format 2.0 event carries: the
 * claims and the scopes beside them, with `scopes` null rather than an empty
 * list when the token carries no scope claim.
 */
export class SimHttpApiJwtClaims {
  private readonly claims: SimJwtClaims;

  constructor(claims: SimJwtClaims) {
    this.claims = claims;
  }

  /**
   * The `requestContext.authorizer.jwt` block for this token.
   */
  toAuthorizerContext(): SimPayload2JwtAuthorizer {
    return { claims: simJwtClaimStrings(this.claims), scopes: this.scopes() };
  }

  /**
   * The scopes this token claims, or null when it claims none.
   */
  scopes(): string[] | null {
    return simJwtScopes(this.claims);
  }
}
