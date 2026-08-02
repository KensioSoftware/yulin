import type { SimPayload2JwtAuthorizer } from "../../../../serve/payload-2/sim-payload-2-event.type.js";
import {
  isSimJwtClaimList,
  type SimJwtClaims,
  type SimJwtClaimValue,
} from "../../../../util/jwt/sim-jwt-claims.js";

/**
 * The claims a scope can be written in.
 *
 * `scope` is what an OAuth 2.0 access token carries, and `scp` is what some
 * issuers use instead. Cognito writes `scope`.
 */
const scopeClaimNames = ["scope", "scp"];

/**
 * The claims of an accepted token, as they reach the handler.
 *
 * Two things here are observed rather than published by AWS. Every claim value
 * arrives at the handler as a string, and a list claim such as
 * `cognito:groups` is rendered the way Go prints a slice, so two groups arrive
 * as `[GroupA GroupB]` rather than as JSON or as a comma-separated list. And
 * `scopes` is null, not an empty list, when the token carries no scope claim.
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
    return { claims: this.claimStrings(), scopes: this.scopes() };
  }

  /**
   * The scopes this token claims, or null when it claims none.
   */
  scopes(): string[] | null {
    for (const name of scopeClaimNames) {
      const claimed = this.claimedScopes(name);

      if (claimed !== undefined) {
        return claimed;
      }
    }

    return null;
  }

  private claimedScopes(name: string): string[] | undefined {
    const text = this.claims.text(name);

    if (text !== undefined) {
      return text.split(/\s+/).filter((scope) => scope.length > 0);
    }

    const list = this.claims.textList(name);

    return list === undefined ? undefined : [...list];
  }

  private claimStrings(): Record<string, string> {
    return Object.fromEntries(
      Object.entries(this.claims.toRecord()).map(([name, value]) => [
        name,
        this.claimString(value),
      ]),
    );
  }

  /**
   * One claim value as the string the handler receives.
   *
   * A nested object claim is JSON-encoded, which is the one shape here that
   * was not observed on real AWS: no simulated issuer emits one, and neither
   * does Cognito.
   */
  private claimString(value: SimJwtClaimValue): string {
    if (typeof value === "string") {
      return value;
    }

    if (isSimJwtClaimList(value)) {
      return `[${value.map((entry) => this.claimString(entry)).join(" ")}]`;
    }

    if (typeof value === "object" && value !== null) {
      return JSON.stringify(value);
    }

    return String(value);
  }
}
