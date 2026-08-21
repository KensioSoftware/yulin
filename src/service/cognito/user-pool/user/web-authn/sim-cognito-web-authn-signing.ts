import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  type KeyObject,
} from "node:crypto";

/**
 * The COSE algorithm identifier for ECDSA over P-256 with SHA-256, which every
 * platform authenticator supports and which Cognito asks for.
 */
export const simCognitoWebAuthnAlgorithm = -7;

/**
 * How many bytes of challenge a ceremony is given.
 */
const challengeBytes = 32;

/**
 * How many bytes of credential id an authenticator allocates.
 */
const credentialIdBytes = 16;

/**
 * The authenticator data flags this simulation sets, which say the user was
 * present and the authenticator verified who was holding it.
 *
 * Real flags also say whether attested credential data follows. Nothing here
 * reads a registration's authenticator data beyond the relying party it names.
 */
const presentAndVerified = 0x05;

/**
 * A key pair standing in for the one a passkey lives as.
 */
export interface SimCognitoWebAuthnKeyPair {
  readonly publicKey: KeyObject;
  readonly privateKey: KeyObject;
}

/**
 * Issue the key pair a new passkey is made of.
 *
 * The private half is what an authenticator would keep and never hand over,
 * and the public half is what the pool stores against the credential.
 */
export function simCognitoWebAuthnKeyPair(): SimCognitoWebAuthnKeyPair {
  return generateKeyPairSync("ec", { namedCurve: "P-256" });
}

/**
 * A run of random bytes as base64url, which is how a challenge and a
 * credential id both travel.
 */
export function simCognitoWebAuthnChallenge(): string {
  return randomBytes(challengeBytes).toString("base64url");
}

/**
 * The identifier an authenticator gives a credential it has just created.
 */
export function simCognitoWebAuthnCredentialId(): string {
  return randomBytes(credentialIdBytes).toString("base64url");
}

/**
 * The client data a browser would have collected, as the JSON bytes an
 * authenticator signs over.
 *
 * The origin is the relying party's own, because a passkey registered against
 * a domain is presented from that domain and nowhere else.
 */
export function simCognitoWebAuthnClientData(
  type: "webauthn.create" | "webauthn.get",
  challenge: string,
  relyingPartyId: string,
): Buffer {
  return Buffer.from(
    JSON.stringify({
      type,
      challenge,
      origin: `https://${relyingPartyId}`,
      crossOrigin: false,
    }),
  );
}

/**
 * The authenticator data of one ceremony: the relying party the credential
 * answers for, what the authenticator checked, and how many times it has
 * signed.
 */
export function simCognitoWebAuthnAuthenticatorData(
  relyingPartyId: string,
  signCount: number,
): Buffer {
  const flags = Buffer.alloc(5);

  flags.writeUInt8(presentAndVerified, 0);
  flags.writeUInt32BE(signCount, 1);

  return Buffer.concat([
    createHash("sha256").update(relyingPartyId).digest(),
    flags,
  ]);
}
