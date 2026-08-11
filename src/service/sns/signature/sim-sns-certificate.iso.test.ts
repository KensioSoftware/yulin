import { generateKeyPairSync, X509Certificate } from "node:crypto";
import { assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";
import {
  simSnsSelfSignedCertificatePem,
  simSnsSerialNumber,
} from "./sim-sns-certificate.js";

/**
 * One key pair, generated once, because generating RSA takes long enough to
 * notice and nothing here is about the key.
 */
const keyPair = generateKeyPairSync("rsa", { modulusLength: 2048 });

/**
 * Issue a certificate whose serial number comes from this digest, and read it
 * back the way a verifier reads it.
 *
 * Parsing is the assertion this makes on its own: OpenSSL refuses a
 * certificate it cannot read rather than reading it leniently, so a digest
 * that produces a serial number DER cannot carry fails here.
 */
function issuedCertificate(digest: Buffer): X509Certificate {
  return new X509Certificate(
    simSnsSelfSignedCertificatePem({
      privateKey: keyPair.privateKey,
      publicKey: keyPair.publicKey,
      subjectName: "sns.us-east-1.yulin.invalid",
      serialNumber: simSnsSerialNumber(digest),
    }),
  );
}

describe("sim SNS certificate serial number", () => {
  it("issues a readable certificate for a digest starting with a zero byte", () => {
    // Given a public key whose digest starts with a byte of zero, followed by
    // one whose top bit is clear.
    const digest = Buffer.from("0037d739ee739e1900112233445566", "hex");

    // When the certificate is issued and read back.
    const certificate = issuedCertificate(digest);

    // Then the leading zero is left out of the serial number, because a DER
    // integer carries no byte it does not need and OpenSSL rejects the whole
    // certificate over the one it did not need.
    assertIdentical(certificate.serialNumber, "37D739EE739E19");
  });

  it("issues a positive serial number for a digest starting with a high byte", () => {
    // Given a public key whose digest starts with a byte whose top bit is set,
    // which is the sign bit of a DER integer.
    const digest = Buffer.from("f037d739ee739e1900112233445566", "hex");

    // When the certificate is issued and read back.
    const certificate = issuedCertificate(digest);

    // Then it reads back as that number rather than as the negative one those
    // same bytes are when nothing keeps a DER integer positive, because a
    // certificate serial number has to be positive.
    assertIdentical(certificate.serialNumber, "F037D739EE739E19");
  });

  it("issues a readable certificate for a digest of nothing but zeroes", () => {
    // Given a public key whose digest is all zeroes, which no real digest is
    // and which the encoding still has to have an answer for.
    const digest = Buffer.alloc(16);

    // When the certificate is issued and read back.
    const certificate = issuedCertificate(digest);

    // Then the serial number is zero, written as the one byte DER writes zero
    // as rather than as no bytes at all, which is a number and not a value a
    // reader refuses.
    assertIdentical(certificate.serialNumber, "0");
  });
});
