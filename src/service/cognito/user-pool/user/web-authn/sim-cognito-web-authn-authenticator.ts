import type {
  SimCognitoWebAuthnCreationOptions,
  SimCognitoWebAuthnCredentialDocument,
} from "./sim-cognito-web-authn-document.js";
import {
  simCognitoWebAuthnAlgorithm,
  simCognitoWebAuthnAuthenticatorData,
  simCognitoWebAuthnClientData,
  simCognitoWebAuthnCredentialId,
  simCognitoWebAuthnKeyPair,
  simCognitoWebAuthnPublicKey,
} from "./sim-cognito-web-authn-signing.js";

/**
 * How a passkey made here says it is attached, which is what a platform
 * authenticator such as a phone or a laptop reports.
 */
const attachment = "platform";

/**
 * How a passkey made here says it can be reached.
 */
const transports: readonly string[] = ["internal", "hybrid"];

/**
 * Create a passkey for a registration's options, as a browser running
 * `navigator.credentials.create()` would.
 *
 * WebAuthn has two sides. The pool holds public keys and checks signatures,
 * and a phone or a laptop holds the private keys and produces them. There is
 * neither in a test, so this stands in for the device, in the way
 * `SimCognitoUserPool.softwareTokenCode` reads the code a user's authenticator
 * app would be showing.
 *
 * The key pair is a real ECDSA pair over P-256 and the public half travels in
 * `publicKey`, the field a browser's own JSON serialization carries it in. The
 * private half is dropped, because nothing presents a passkey yet.
 *
 * `attestationObject` is where a real authenticator states which device it is,
 * wrapped in CBOR. Nothing reads one here, and the public key is read from
 * `publicKey` instead, so the attestation is the signed authenticator data and
 * no more.
 *
 * A test that would rather hold its own key can build the credential document
 * itself. It is the JSON a browser serializes a `PublicKeyCredential` to, and
 * nothing here reads a field a browser leaves out.
 */
export function simCognitoWebAuthnCreated(
  options: SimCognitoWebAuthnCreationOptions,
): SimCognitoWebAuthnCredentialDocument {
  const credentialId = simCognitoWebAuthnCredentialId();
  const signed = simCognitoWebAuthnAuthenticatorData(options.rp.id, 0);
  const collected = simCognitoWebAuthnClientData(
    "webauthn.create",
    options.challenge,
    options.rp.id,
  );

  return {
    id: credentialId,
    rawId: credentialId,
    type: "public-key",
    authenticatorAttachment: attachment,
    response: {
      clientDataJSON: collected.toString("base64url"),
      attestationObject: signed.toString("base64url"),
      authenticatorData: signed.toString("base64url"),
      publicKey: simCognitoWebAuthnPublicKey(
        simCognitoWebAuthnKeyPair().publicKey,
      ),
      publicKeyAlgorithm: simCognitoWebAuthnAlgorithm,
      transports: [...transports],
    },
    clientExtensionResults: {},
  };
}
