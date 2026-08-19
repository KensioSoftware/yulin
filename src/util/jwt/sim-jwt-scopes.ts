import type { SimJwtClaims } from "./sim-jwt-claims.js";

/**
 * The claims a scope can be written in.
 *
 * `scope` is what an OAuth 2.0 access token carries, and `scp` is what some
 * issuers use instead. Cognito writes `scope`.
 */
const scopeClaimNames = ["scope", "scp"];

/**
 * The scopes a token claims, or null when it claims none.
 *
 * Null rather than an empty list is what API Gateway reports for a token
 * carrying no scope claim at all, which is every Cognito id token.
 */
export function simJwtScopes(claims: SimJwtClaims): string[] | null {
  for (const name of scopeClaimNames) {
    const claimed = claimedScopes(claims, name);

    if (claimed !== undefined) {
      return claimed;
    }
  }

  return null;
}

/**
 * The scopes one claim holds, whether it was written as space-separated text
 * or as a list.
 */
function claimedScopes(
  claims: SimJwtClaims,
  name: string,
): string[] | undefined {
  const text = claims.text(name);

  if (text !== undefined) {
    return text.split(/\s+/u).filter((scope) => scope.length > 0);
  }

  const list = claims.textList(name);

  return list === undefined ? undefined : [...list];
}
