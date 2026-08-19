import {
  isSimJwtClaimList,
  type SimJwtClaims,
  type SimJwtClaimValue,
} from "./sim-jwt-claims.js";

/**
 * The claims of an accepted token, as they reach a handler behind API Gateway.
 *
 * Two things here are observed rather than published by AWS. Every claim value
 * arrives at the handler as a string, and a list claim such as
 * `cognito:groups` is rendered the way Go prints a slice, so two groups arrive
 * as `[GroupA GroupB]` rather than as JSON or as a comma-separated list. Both
 * API Gateway versions render them the same way, which is why this is here
 * rather than in one of them.
 */
export function simJwtClaimStrings(
  claims: SimJwtClaims,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(claims.toRecord()).map(([name, value]) => [
      name,
      simJwtClaimString(value),
    ]),
  );
}

/**
 * One claim value as the string the handler receives.
 *
 * A nested object claim is JSON-encoded, which is the one shape here that was
 * not observed on real AWS: no simulated issuer emits one, and neither does
 * Cognito.
 */
function simJwtClaimString(value: SimJwtClaimValue): string {
  if (typeof value === "string") {
    return value;
  }

  if (isSimJwtClaimList(value)) {
    return `[${value.map((entry) => simJwtClaimString(entry)).join(" ")}]`;
  }

  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value);
  }

  return String(value);
}
