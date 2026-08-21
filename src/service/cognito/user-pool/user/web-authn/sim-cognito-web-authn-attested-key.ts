import type { KeyObject } from "node:crypto";

import { SimCognitoWebAuthnCredentialNotSupportedException } from "../../../error/sim-cognito-web-authn.error.js";
import { requireSimCognitoWebAuthnCeremony } from "./sim-cognito-web-authn-ceremony.js";
import { SimCognitoWebAuthnCredential } from "./sim-cognito-web-authn-credential.js";
import type { SimCognitoWebAuthnCreationOptions } from "./sim-cognito-web-authn-document.js";
import { simCognitoWebAuthnKeyFrom } from "./sim-cognito-web-authn-public-key.js";
import { simCognitoWebAuthnAlgorithm } from "./sim-cognito-web-authn-signing.js";

/**
 * How a credential says it is attached when it says nothing, which is what a
 * phone or a laptop reports.
 */
const defaultAttachment = "platform";

/**
 * The public key a credential carries, or a refusal where the pool cannot read
 * one.
 */
function publicKeyOf(response: Readonly<Record<string, unknown>>): KeyObject {
  const encoded = response["publicKey"];
  const publicKey =
    typeof encoded === "string"
      ? simCognitoWebAuthnKeyFrom(encoded)
      : undefined;

  if (
    publicKey === undefined ||
    response["publicKeyAlgorithm"] !== simCognitoWebAuthnAlgorithm
  ) {
    throw new SimCognitoWebAuthnCredentialNotSupportedException(
      "The credential carries no public key this user pool can use: the " +
        "registration asked for ECDSA over P-256, which a browser reports " +
        "as response.publicKey with a publicKeyAlgorithm of " +
        `${String(simCognitoWebAuthnAlgorithm)}.`,
    );
  }

  return publicKey;
}

/**
 * The strings of a credential member that is meant to be a list of them.
 */
function stringsOf(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return (value as readonly unknown[]).filter(
    (each): each is string => typeof each === "string",
  );
}

/**
 * The passkey a pool keeps out of the credential a registration carried.
 *
 * The credential is read against the options the registration was issued with,
 * which say which challenge it has to answer and which relying party it has to
 * have been signed for. A browser reports the public key as
 * `response.publicKey`, base64url of its SubjectPublicKeyInfo, and names the
 * algorithm beside it. That is what is read here rather than the attestation
 * object, which a real relying party parses out of CBOR and this simulation
 * does not.
 */
export function simCognitoWebAuthnRegistered(
  pending: SimCognitoWebAuthnCreationOptions,
  credential: unknown,
  createdAt: Date,
): SimCognitoWebAuthnCredential {
  const relyingPartyId = pending.rp.id;
  const ceremony = requireSimCognitoWebAuthnCeremony({
    credential,
    field: "Credential",
    type: "webauthn.create",
    challenge: pending.challenge,
    relyingPartyId,
  });
  const attachment = ceremony.document["authenticatorAttachment"];

  return new SimCognitoWebAuthnCredential({
    credentialId: ceremony.credentialId,
    publicKey: publicKeyOf(ceremony.response),
    relyingPartyId,
    authenticatorAttachment:
      typeof attachment === "string" ? attachment : defaultAttachment,
    transports: stringsOf(ceremony.response["transports"]),
    createdAt,
  });
}
