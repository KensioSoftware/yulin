import type { SimClock } from "../../../../util/clock/sim-clock.js";
import { SimJwtRs256 } from "../../../../util/jwt/sim-jwt-rs256.js";
import { SimJwt } from "../../../../util/jwt/sim-jwt.js";
import type { SimHttpApiAuthorizer } from "./sim-http-api-authorizer.js";
import {
  SimHttpApiAdmitted,
  type SimHttpApiAuthorization,
  SimHttpApiRefused,
} from "./sim-http-api-authorization.js";
import { SimHttpApiJwtClaimChecks } from "./sim-http-api-jwt-claim-checks.js";
import { SimHttpApiJwtClaims } from "./sim-http-api-jwt-claims.js";
import type { SimHttpApiJwtIssuerKeys } from "./sim-http-api-jwt-issuer-keys.js";

interface SimHttpApiJwtVerificationProperties {
  readonly issuerKeys: SimHttpApiJwtIssuerKeys;
  readonly clock: SimClock;
}

/**
 * Verifies one token against one JWT authorizer.
 *
 * The checks run in the order AWS documents: decode the token, check its
 * algorithm, find the key its `kid` names, verify the signature, then validate
 * the claims. AWS lists the signature above the key id; the key has to be
 * chosen before a signature can be checked, and every one of these answers the
 * same 401, so the two are not distinguishable from outside.
 *
 * `token_use` is not checked, which is what real API Gateway does. An id token
 * therefore passes an authorizer configured only with an audience, because its
 * `aud` is the app client id. Route scopes are the only thing that tells the
 * two token types apart, and they are the route's business rather than this
 * one's.
 */
export class SimHttpApiJwtVerification {
  private readonly issuerKeys: SimHttpApiJwtIssuerKeys;
  private readonly claimChecks: SimHttpApiJwtClaimChecks;
  private readonly rs256 = new SimJwtRs256();

  constructor(properties: SimHttpApiJwtVerificationProperties) {
    this.issuerKeys = properties.issuerKeys;
    this.claimChecks = new SimHttpApiJwtClaimChecks({
      clock: properties.clock,
    });
  }

  /**
   * Verify a token, answering what the endpoint should do with the request
   * that carried it.
   */
  verify(
    authorizer: SimHttpApiAuthorizer,
    token: string,
  ): SimHttpApiAuthorization {
    const jwt = this.decode(token);

    if (jwt === undefined) {
      return SimHttpApiRefused.unauthorized();
    }

    if (!this.rs256.isSupportedAlgorithm(jwt)) {
      return SimHttpApiRefused.unauthorized();
    }

    const { jwtConfiguration } = authorizer;
    const key = this.issuerKeys
      .publishedBy(jwtConfiguration.issuer)
      .find(jwt.header.kid);

    if (key === undefined || !this.rs256.verify(jwt, key)) {
      return SimHttpApiRefused.unauthorized();
    }

    return (
      this.claimChecks.check(jwt.claims, jwtConfiguration) ??
      new SimHttpApiAdmitted(
        new SimHttpApiJwtClaims(jwt.claims).toAuthorizerContext(),
      )
    );
  }

  /**
   * Read the token, or answer undefined for one that is not a JWT at all.
   *
   * The refusal for an unreadable token and for one that fails verification is
   * the same, so nothing is gained by carrying the parse error further.
   */
  private decode(token: string): SimJwt | undefined {
    try {
      return SimJwt.parse(token);
    } catch {
      return undefined;
    }
  }
}
