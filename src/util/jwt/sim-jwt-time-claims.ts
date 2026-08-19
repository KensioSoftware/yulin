import type { SimClock } from "../clock/sim-clock.js";
import type { SimJwtClaims } from "./sim-jwt-claims.js";

interface SimJwtTimeClaimsProperties {
  readonly clock: SimClock;
}

/**
 * The time claims of a token, checked against a clock.
 *
 * The comparison allows nothing for clock skew. That is what makes advancing
 * the simulation's clock past a token's `exp` turn an accepted request into a
 * refused one with nothing else changed.
 */
export class SimJwtTimeClaims {
  private readonly clock: SimClock;

  constructor(properties: SimJwtTimeClaimsProperties) {
    this.clock = properties.clock;
  }

  /**
   * Whether `exp`, `nbf` and `iat` all hold at this moment.
   *
   * A token with no `exp` holds nothing rather than never expiring: real
   * Cognito always sets it, and admitting a token nothing can expire is the
   * divergence worth failing on.
   */
  hold(claims: SimJwtClaims): boolean {
    const now = Math.floor(this.clock.now().getTime() / 1000);
    const expiresAt = claims.number("exp");

    if (expiresAt === undefined || now >= expiresAt) {
      return false;
    }

    return (
      !this.isBefore(now, claims.number("nbf")) &&
      !this.isBefore(now, claims.number("iat"))
    );
  }

  /**
   * Whether now is earlier than a time claim the token carries. A claim the
   * token does not carry is nothing to be earlier than.
   */
  private isBefore(now: number, claimed: number | undefined): boolean {
    return claimed !== undefined && now < claimed;
  }
}
