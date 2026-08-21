import { createPublicKey, type KeyObject } from "node:crypto";

/**
 * The curve an ES256 key is over, as `node:crypto` names it.
 */
const namedCurve = "prime256v1";

/**
 * The public key as it travels in a credential, which is base64url of its
 * SubjectPublicKeyInfo.
 *
 * This is the encoding `PublicKeyCredential.toJSON()` uses for the `publicKey`
 * a browser reports, so a credential built here carries the key in the shape a
 * real one carries it.
 */
export function simCognitoWebAuthnPublicKey(publicKey: KeyObject): string {
  return publicKey
    .export({ format: "der", type: "spki" })
    .toString("base64url");
}

/**
 * Read a public key back out of a credential, or nothing where the value is
 * not a key this pool can use.
 *
 * A registration asks for ECDSA over P-256 and nothing else, so a key of
 * another kind is no more usable than a value that is not a key at all. The
 * algorithm a credential names is the caller's word for it, and this is the
 * key itself.
 */
export function simCognitoWebAuthnKeyFrom(
  encoded: string,
): KeyObject | undefined {
  try {
    const publicKey = createPublicKey({
      key: Buffer.from(encoded, "base64url"),
      format: "der",
      type: "spki",
    });

    if (
      publicKey.asymmetricKeyType !== "ec" ||
      publicKey.asymmetricKeyDetails?.namedCurve !== namedCurve
    ) {
      return undefined;
    }

    return publicKey;
  } catch {
    return undefined;
  }
}
