import { SimCognitoNotAuthorizedException } from "../../../error/sim-cognito.error.js";
import { requireSimCognitoWebAuthnCeremony } from "./sim-cognito-web-authn-ceremony.js";
import type { SimCognitoWebAuthnCredential } from "./sim-cognito-web-authn-credential.js";
import type {
  SimCognitoWebAuthnCredentialDescriptor,
  SimCognitoWebAuthnRequestOptions,
} from "./sim-cognito-web-authn-document.js";
import { simCognitoWebAuthnChallenge } from "./sim-cognito-web-authn-signing.js";

/**
 * How long a browser is given to present a passkey, in milliseconds.
 */
const ceremonyTimeout = 60_000;

/**
 * The options a passkey is presented against, which a browser passes straight
 * to `navigator.credentials.get()`.
 *
 * The passkeys the user has are named under `allowCredentials`, so an
 * authenticator holding several knows which of them this pool would take.
 */
export function simCognitoWebAuthnRequestOptions(
  relyingPartyId: string,
  userVerification: string,
  allowed: readonly SimCognitoWebAuthnCredentialDescriptor[],
): SimCognitoWebAuthnRequestOptions {
  return {
    challenge: simCognitoWebAuthnChallenge(),
    rpId: relyingPartyId,
    timeout: ceremonyTimeout,
    allowCredentials: allowed,
    userVerification,
  };
}

/**
 * The passkey a credential presented, having checked that it is one of this
 * user's and that this user's key signed it.
 *
 * The ceremony is read the way a registration's is, and the signature is then
 * checked against the public key the pool stored. A credential naming a
 * passkey this user does not have, and one signed by another key, are both
 * refused as `NotAuthorizedException`, which is what real Cognito answers a
 * sign-in it will not complete with.
 */
export function requireSimCognitoWebAuthnAssertion(
  credentials: readonly SimCognitoWebAuthnCredential[],
  credential: unknown,
  options: SimCognitoWebAuthnRequestOptions,
): SimCognitoWebAuthnCredential {
  const ceremony = requireSimCognitoWebAuthnCeremony({
    credential,
    field: "CREDENTIAL",
    type: "webauthn.get",
    challenge: options.challenge,
    relyingPartyId: options.rpId,
  });
  const presented = credentials.find(
    (each) => each.credentialId === ceremony.credentialId,
  );

  if (presented === undefined) {
    throw new SimCognitoNotAuthorizedException(
      "The credential presents a passkey this user has not registered.",
    );
  }

  const signature = ceremony.response["signature"];

  if (
    typeof signature !== "string" ||
    !presented.signed(ceremony, Buffer.from(signature, "base64url"))
  ) {
    throw new SimCognitoNotAuthorizedException(
      "The credential was not signed by this passkey.",
    );
  }

  return presented;
}
