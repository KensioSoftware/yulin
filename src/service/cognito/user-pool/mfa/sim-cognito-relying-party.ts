import { SimCognitoWebAuthnConfigurationMissingException } from "../../error/sim-cognito-web-authn.error.js";
import type { SimCognitoUserPool } from "../sim-cognito-user-pool.js";

/**
 * What an authenticator is asked to check when the pool has said nothing,
 * which is the value real Cognito applies.
 */
const defaultUserVerification = "preferred";

/**
 * The relying party a pool registers and presents passkeys against.
 *
 * A passkey belongs to a domain. A pool that configured a `RelyingPartyId`
 * uses that, and one that did not falls back to its own hosted domain, which
 * is what real Cognito falls back to. A pool with neither has nothing to
 * register a passkey against and nothing to present one to, and real Cognito
 * refuses that with `WebAuthnConfigurationMissingException`.
 */
export function requireSimCognitoRelyingParty(
  pool: SimCognitoUserPool,
): string {
  const relyingPartyId =
    pool.settings.mfa.webAuthn?.relyingPartyId ?? pool.auth.domain?.hostname;

  if (relyingPartyId === undefined) {
    throw new SimCognitoWebAuthnConfigurationMissingException(
      `The user pool ${pool.id} registers passkeys against no relying party: ` +
        `give it a hosted domain with CreateUserPoolDomain, or set one with ` +
        `SetUserPoolMfaConfig WebAuthnConfiguration RelyingPartyId, which an ` +
        `AWS::Cognito::UserPool Resource deploys as WebAuthnRelyingPartyID.`,
    );
  }

  return relyingPartyId;
}

/**
 * Whether the pool asks an authenticator to check who is holding it.
 */
export function simCognitoUserVerification(pool: SimCognitoUserPool): string {
  return (
    pool.settings.mfa.webAuthn?.userVerification ?? defaultUserVerification
  );
}
