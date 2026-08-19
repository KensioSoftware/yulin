import type { SimClock } from "../../../../util/clock/sim-clock.js";
import type { SimJwtClaims } from "../../../../util/jwt/sim-jwt-claims.js";
import { SimJwtTimeClaims } from "../../../../util/jwt/sim-jwt-time-claims.js";
import { SimHttpApiRefused } from "./sim-http-api-authorization.js";
import type { SimHttpApiJwtConfiguration } from "./sim-http-api-jwt-configuration.js";

/**
 * The only description AWS publishes for a refused token.
 *
 * Every other refusal here sends no description at all, rather than text AWS
 * was not seen to send.
 */
export const simHttpApiInvalidAudience =
  "the token does not have a valid audience";

interface SimHttpApiJwtClaimChecksProperties {
  readonly clock: SimClock;
}

/**
 * The claim validation a JWT authorizer does once a token's signature is known
 * to be genuine.
 *
 * The order is the one AWS documents: the issuer, then the audience, then the
 * time claims. It is only visible in which description a refusal carries,
 * since every one of them answers the same 401.
 *
 * The time claims are compared with no allowance for clock skew. That is what
 * makes advancing the simulation's clock past a token's `exp` turn an accepted
 * request into a refused one with nothing else changed.
 */
export class SimHttpApiJwtClaimChecks {
  private readonly times: SimJwtTimeClaims;

  constructor(properties: SimHttpApiJwtClaimChecksProperties) {
    this.times = new SimJwtTimeClaims({ clock: properties.clock });
  }

  /**
   * Check the claims of a verified token, answering the refusal to send when
   * one of them does not hold.
   */
  check(
    claims: SimJwtClaims,
    configuration: SimHttpApiJwtConfiguration,
  ): SimHttpApiRefused | undefined {
    if (!configuration.trustsIssuer(claims.text("iss"))) {
      return SimHttpApiRefused.unauthorized();
    }

    if (!configuration.acceptsAudience(this.claimedAudience(claims))) {
      return SimHttpApiRefused.unauthorized(simHttpApiInvalidAudience);
    }

    return this.times.hold(claims)
      ? undefined
      : SimHttpApiRefused.unauthorized();
  }

  /**
   * The audiences a token claims.
   *
   * `client_id` is consulted only when there is no `aud` claim at all, which
   * is what makes an access token bound to a resource server fail rather than
   * fall back to the app client it was issued to. An `aud` holding something
   * that is not a string or a list of them claims no audience, rather than
   * being read past.
   */
  private claimedAudience(claims: SimJwtClaims): readonly string[] {
    if (claims.has("aud")) {
      return claims.textList("aud") ?? [];
    }

    const clientId = claims.text("client_id");

    return clientId === undefined ? [] : [clientId];
  }
}
