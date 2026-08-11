import type { KeyObject } from "node:crypto";
import { createSign } from "node:crypto";
import {
  derBitStringTag,
  derBytes,
  derExplicitZeroTag,
  derInteger,
  derNullTag,
  derObjectIdentifierTag,
  derPrintableStringTag,
  derSequenceTag,
  derSetTag,
  derText,
  derUtcTimeTag,
  derValue,
} from "./sim-sns-der.js";

/**
 * The body bytes of the sha1WithRSAEncryption object identifier,
 * 1.2.840.113549.1.1.5.
 *
 * This is the algorithm signature version 1 names, which is the version real
 * SNS signs with unless a topic opts into version 2.
 */
const sha1WithRsaEncryption = [
  0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x05,
];

/**
 * The body bytes of the commonName object identifier, 2.5.4.3.
 */
const commonName = [0x55, 0x04, 0x03];

/**
 * The version number of an X.509 v3 certificate, which counts from zero.
 */
const version3 = Buffer.from([2]);

/**
 * When the certificate becomes valid, and when it stops being valid.
 *
 * Both are fixed rather than taken from the clock, so the same key always
 * produces the same certificate and nothing in a test suite depends on when it
 * ran. The end is before 2050 because a certificate valid past then cannot use
 * the UTCTime encoding, and nothing here is a real trust anchor that ought to
 * expire.
 */
const notBefore = new Date("2000-01-01T00:00:00.000Z");

const notAfter = new Date("2049-12-31T23:59:59.000Z");

/**
 * How many bytes of the public key digest become the serial number.
 */
const serialNumberBytes = 8;

/**
 * How many base64 characters a PEM document puts on one line.
 */
const pemLineLength = 64;

interface SimSnsCertificateInput {
  readonly privateKey: KeyObject;
  readonly publicKey: KeyObject;
  readonly subjectName: string;
  readonly serialNumber: Buffer;
}

/**
 * A UTCTime, which is the two digit year form certificates date things with.
 *
 * Two digits means the year has to be before 2050, which is what X.509 says: a
 * certificate valid past then carries a GeneralizedTime instead.
 */
function utcTime(instant: Date): Buffer {
  const digits = instant.toISOString().replaceAll(/\D/gu, "");

  return derText(derUtcTimeTag, `${digits.slice(2, 14)}Z`);
}

/**
 * Wrap DER bytes as the PEM document a verifier reads.
 */
function toPem(der: Buffer): string {
  const base64 = der.toString("base64");
  const lines = Array.from(
    { length: Math.ceil(base64.length / pemLineLength) },
    (_unused, index) =>
      base64.slice(index * pemLineLength, (index + 1) * pemLineLength),
  );

  return `-----BEGIN CERTIFICATE-----\n${lines.join("\n")}\n-----END CERTIFICATE-----\n`;
}

/**
 * The algorithm identifier both the certificate body and its signature carry.
 */
function signatureAlgorithm(): Buffer {
  return derValue(
    derSequenceTag,
    derBytes(derObjectIdentifierTag, ...sha1WithRsaEncryption),
    derValue(derNullTag),
  );
}

/**
 * An X.509 Name carrying one common name, which is all this certificate needs.
 */
function distinguishedName(name: string): Buffer {
  const attribute = derValue(
    derSequenceTag,
    derBytes(derObjectIdentifierTag, ...commonName),
    derText(derPrintableStringTag, name),
  );

  return derValue(derSequenceTag, derValue(derSetTag, attribute));
}

/**
 * The part of a certificate that is signed.
 */
function certificateBody(input: SimSnsCertificateInput): Buffer {
  const name = distinguishedName(input.subjectName);

  return derValue(
    derSequenceTag,
    derValue(derExplicitZeroTag, derInteger(version3)),
    derInteger(input.serialNumber),
    signatureAlgorithm(),
    name,
    derValue(derSequenceTag, utcTime(notBefore), utcTime(notAfter)),
    // Self-signed, so the issuer and the subject are the same Name.
    name,
    input.publicKey.export({ type: "spki", format: "der" }),
  );
}

/**
 * Build a self-signed X.509 certificate for a key pair, as PEM.
 *
 * It is the smallest certificate that is still a certificate: a version, a
 * serial number, one common name as both issuer and subject, a validity window,
 * the public key, and an RSA signature over all of it. There are no extensions,
 * because nothing verifying an SNS message looks at any.
 */
export function simSnsSelfSignedCertificatePem(
  input: SimSnsCertificateInput,
): string {
  const body = certificateBody(input);
  const signature = createSign("RSA-SHA1").update(body).sign(input.privateKey);
  const unusedBits = Buffer.from([0]);

  return toPem(
    derValue(
      derSequenceTag,
      body,
      signatureAlgorithm(),
      derValue(derBitStringTag, unusedBits, signature),
    ),
  );
}

/**
 * Read a certificate serial number out of a digest of the public key.
 *
 * A real certificate authority allocates serial numbers. Nothing here has one
 * to allocate, and a serial derived from the key is unique in the only way that
 * matters: two simulated scopes with different keys have different serials.
 *
 * The bytes are the number itself, unsigned, and `derInteger` writes them the
 * way DER writes an unsigned number: a serial has to be positive, and how a
 * positive number is kept positive is the encoding's business rather than
 * this function's.
 */
export function simSnsSerialNumber(digest: Buffer): Buffer {
  return Buffer.from(digest.subarray(0, serialNumberBytes));
}
