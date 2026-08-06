import { SimCognitoInvalidLambdaResponseException } from "../../error/sim-cognito-trigger.error.js";

/**
 * The claims a `PreTokenGeneration` handler may not add, override or suppress.
 *
 * These are the ones real Cognito reserves: the JWT registered claims that say
 * when a token was issued and who by, and the Cognito claims that identify the
 * user and the token. A handler naming one of them changes nothing on real
 * Cognito, which drops the override without saying so.
 */
const reservedClaims: ReadonlySet<string> = new Set([
  "acr",
  "amr",
  "at_hash",
  "aud",
  "auth_time",
  "azp",
  "cognito:username",
  "exp",
  "iat",
  "identities",
  "iss",
  "jti",
  "nbf",
  "nonce",
  "origin_jti",
  "sub",
  "token_use",
]);

/**
 * The claim a group override is written against, which is the one `cognito:`
 * claim a handler may name in `claimsToSuppress`.
 */
export const simCognitoGroupsClaim = "cognito:groups";

/**
 * Refuse a claim a handler asked to add or override that it may not.
 *
 * Refusing is the divergence worth having. Real Cognito silently ignores an
 * override of a reserved claim, so a handler that appears to work here and does
 * nothing in production is exactly the failure this simulation exists to catch.
 */
export function requireSimCognitoOverridableClaim(claim: string): void {
  if (claim === simCognitoGroupsClaim) {
    throw new SimCognitoInvalidLambdaResponseException(
      `The PreTokenGeneration trigger returned claimsToAddOrOverride naming ` +
        `${simCognitoGroupsClaim}, which real Cognito ignores there. Use ` +
        `groupOverrideDetails.groupsToOverride to change the groups on a ` +
        `token.`,
    );
  }

  if (claim.startsWith("cognito:")) {
    throw new SimCognitoInvalidLambdaResponseException(
      `The PreTokenGeneration trigger returned claimsToAddOrOverride naming ` +
        `${claim}. Real Cognito reserves the cognito: claims and ignores an ` +
        `override of one, so the token would carry the value it was going to ` +
        `carry anyway.`,
    );
  }

  requireUnreservedClaim(claim, "claimsToAddOrOverride");
}

/**
 * Refuse a claim a handler asked to suppress that it may not.
 *
 * `cognito:groups` is suppressible, as it is on real Cognito, and it is the one
 * `cognito:` claim that is.
 */
export function requireSimCognitoSuppressibleClaim(claim: string): void {
  requireUnreservedClaim(claim, "claimsToSuppress");
}

function requireUnreservedClaim(claim: string, field: string): void {
  if (!reservedClaims.has(claim)) {
    return;
  }

  throw new SimCognitoInvalidLambdaResponseException(
    `The PreTokenGeneration trigger returned ${field} naming the reserved ` +
      `claim ${claim}. Real Cognito issues that claim itself and ignores a ` +
      `handler that names it, so a token here would not carry what the ` +
      `handler asked for either.`,
  );
}
