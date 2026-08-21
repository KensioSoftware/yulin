import type {
  SimCognitoWebAuthnCreationOptions,
  SimCognitoWebAuthnCredentialDocument,
  SimCognitoWebAuthnRequestOptions,
} from "./sim-cognito-web-authn-document.js";
import { SimCognitoWebAuthnKeys } from "./sim-cognito-web-authn-keys.js";
import { simCognitoWebAuthnPublicKey } from "./sim-cognito-web-authn-public-key.js";
import {
  simCognitoWebAuthnAlgorithm,
  simCognitoWebAuthnAuthenticatorData,
  simCognitoWebAuthnClientData,
  simCognitoWebAuthnCredentialId,
  simCognitoWebAuthnKeyPair,
  simCognitoWebAuthnSignature,
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
 * A credential around the response one ceremony produced.
 */
function credentialOf(
  credentialId: string,
  response: SimCognitoWebAuthnCredentialDocument["response"],
): SimCognitoWebAuthnCredentialDocument {
  return {
    id: credentialId,
    rawId: credentialId,
    type: "public-key",
    authenticatorAttachment: attachment,
    response,
    clientExtensionResults: {},
  };
}

/**
 * The authenticator standing in for a user's own device.
 *
 * WebAuthn has two sides. The pool holds public keys and checks signatures,
 * and a phone or a laptop holds the private keys and produces them. There is
 * neither in a test, so this is the simulator's own, in the way
 * `SimCognitoUserPool.softwareTokenCode` reads the code a user's authenticator
 * app would be showing.
 *
 * The keys are real ECDSA keys over P-256 and the signatures are real, so a
 * credential this produces is accepted because it verifies. A test that would
 * rather hold its own key can build the credential document itself. It is the
 * JSON a browser serializes a `PublicKeyCredential` to, and nothing here reads
 * a field a browser leaves out.
 */
export class SimCognitoWebAuthnDevice {
  readonly #keys = new SimCognitoWebAuthnKeys();

  /**
   * Create a passkey for a registration's options, as
   * `navigator.credentials.create()` would.
   *
   * `attestationObject` is where a real authenticator states which device it
   * is, wrapped in CBOR. Nothing reads one here, and the public key travels in
   * `publicKey`, the field a browser's own JSON serialization carries it in,
   * so the attestation is the signed authenticator data and no more.
   */
  create(
    options: SimCognitoWebAuthnCreationOptions,
  ): SimCognitoWebAuthnCredentialDocument {
    const { publicKey, privateKey } = simCognitoWebAuthnKeyPair();
    const credentialId = simCognitoWebAuthnCredentialId();
    const signed = simCognitoWebAuthnAuthenticatorData(options.rp.id, 0);
    const collected = simCognitoWebAuthnClientData(
      "webauthn.create",
      options.challenge,
      options.rp.id,
    );

    this.#keys.add(credentialId, privateKey);

    return credentialOf(credentialId, {
      clientDataJSON: collected.toString("base64url"),
      attestationObject: signed.toString("base64url"),
      authenticatorData: signed.toString("base64url"),
      publicKey: simCognitoWebAuthnPublicKey(publicKey),
      publicKeyAlgorithm: simCognitoWebAuthnAlgorithm,
      transports: [...transports],
    });
  }

  /**
   * Present a passkey for a sign-in's options, as
   * `navigator.credentials.get()` would.
   */
  present(
    options: SimCognitoWebAuthnRequestOptions,
    userHandle: string,
  ): SimCognitoWebAuthnCredentialDocument {
    const [credentialId, key] = this.#keys.requireOneOf(
      options.allowCredentials.map((each) => each.id),
    );

    key.signCount += 1;

    const signed = simCognitoWebAuthnAuthenticatorData(
      options.rpId,
      key.signCount,
    );
    const collected = simCognitoWebAuthnClientData(
      "webauthn.get",
      options.challenge,
      options.rpId,
    );

    return credentialOf(credentialId, {
      clientDataJSON: collected.toString("base64url"),
      authenticatorData: signed.toString("base64url"),
      signature: simCognitoWebAuthnSignature(key.privateKey, signed, collected),
      userHandle,
    });
  }

  /**
   * Forget a passkey, because the pool that held its public half has.
   */
  forget(credentialId: string): void {
    this.#keys.forget(credentialId);
  }
}
