import {
  createHash,
  createSign,
  generateKeyPairSync,
  type KeyObject,
} from "node:crypto";
import {
  simSnsSelfSignedCertificatePem,
  simSnsSerialNumber,
} from "./sim-sns-certificate.js";

/**
 * The RSA modulus size real SNS signs with.
 */
const modulusLength = 2048;

/**
 * How many characters of the key's digest name the certificate.
 *
 * Real SNS puts an opaque hash in the certificate's file name. This is the
 * same idea, and it means the URL names the key it actually belongs to.
 */
const fingerprintLength = 32;

/**
 * The key one simulated SNS scope signs its messages with.
 *
 * The key material is real, generated with `node:crypto`, and the signature is
 * a real SHA1withRSA signature over the string real SNS signs. A verifier can
 * therefore check a delivered message against the certificate, rather than
 * being handed a `Signature` field it has no way to use.
 */
export class SimSnsSigningKey {
  public readonly fingerprint: string;
  public readonly certificatePem: string;

  private readonly privateKey: KeyObject;

  private constructor(subjectName: string) {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
      modulusLength,
    });
    const digest = createHash("sha256")
      .update(publicKey.export({ type: "spki", format: "der" }))
      .digest();

    this.privateKey = privateKey;
    this.fingerprint = digest.toString("hex").slice(0, fingerprintLength);
    this.certificatePem = simSnsSelfSignedCertificatePem({
      privateKey,
      publicKey,
      subjectName,
      serialNumber: simSnsSerialNumber(digest),
    });
  }

  /**
   * Generate a key pair for a simulated SNS scope.
   *
   * A scope generates its own on first use rather than at construction,
   * because generating 2048-bit RSA takes long enough to notice and most
   * simulated SNS scopes in a test suite never deliver anything. Nothing is
   * written to disk, and no key material is committed: a private key in the
   * repository would set off secret scanners for no gain.
   */
  static generate(subjectName: string): SimSnsSigningKey {
    return new SimSnsSigningKey(subjectName);
  }

  /**
   * Sign the canonical form of a message, as real SNS signs it.
   *
   * Signature version 1 is SHA1withRSA, and the signature travels base64
   * encoded in the envelope. SHA-1 is weak, and it is what real SNS uses for
   * version 1: a simulation signing with something else would produce a
   * signature a real verifier could not check.
   */
  sign(canonicalMessage: string): string {
    return createSign("RSA-SHA1")
      .update(canonicalMessage, "utf8")
      .sign(this.privateKey)
      .toString("base64");
  }
}
