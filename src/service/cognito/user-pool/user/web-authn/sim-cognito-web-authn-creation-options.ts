import type {
  SimCognitoWebAuthnCreationOptions,
  SimCognitoWebAuthnCredentialDescriptor,
} from "./sim-cognito-web-authn-document.js";
import {
  simCognitoWebAuthnAlgorithm,
  simCognitoWebAuthnChallenge,
} from "./sim-cognito-web-authn-signing.js";

/**
 * How long a browser is given to finish a ceremony, in milliseconds.
 *
 * This is the authenticator's own prompt timeout rather than the app client's
 * `AuthSessionValidity`, which is what bounds the sign-in around it.
 */
const ceremonyTimeout = 60_000;

/**
 * What a pool needs to know before it can ask for a passkey.
 */
export interface SimCognitoWebAuthnRegistrationRequest {
  /** The domain the passkey is registered against. */
  readonly relyingPartyId: string;

  /** The pool's own name, which a browser shows the person. */
  readonly relyingPartyName: string;

  /** The user handle the authenticator stores, which is the user's `sub`. */
  readonly userHandle: string;

  /** The name the authenticator shows for the account. */
  readonly username: string;

  /** Whether the authenticator has to check who is holding it. */
  readonly userVerification: string;
}

/**
 * The options a passkey is created from, which a browser passes straight to
 * `navigator.credentials.create()`.
 *
 * The challenge is fresh for every registration, and is what the authenticator
 * signs over. The passkeys the user already has are excluded, so an
 * authenticator already holding one makes another rather than replacing it,
 * and the key is asked to be discoverable so a later sign-in can present it
 * without being told which user is signing in.
 */
export function simCognitoWebAuthnCreationOptions(
  request: SimCognitoWebAuthnRegistrationRequest,
  excluded: readonly SimCognitoWebAuthnCredentialDescriptor[],
): SimCognitoWebAuthnCreationOptions {
  return {
    challenge: simCognitoWebAuthnChallenge(),
    rp: { id: request.relyingPartyId, name: request.relyingPartyName },
    user: {
      id: Buffer.from(request.userHandle).toString("base64url"),
      name: request.username,
      displayName: request.username,
    },
    pubKeyCredParams: [
      { type: "public-key", alg: simCognitoWebAuthnAlgorithm },
    ],
    timeout: ceremonyTimeout,
    excludeCredentials: excluded,
    authenticatorSelection: {
      residentKey: "required",
      requireResidentKey: true,
      userVerification: request.userVerification,
    },
    attestation: "none",
  };
}
