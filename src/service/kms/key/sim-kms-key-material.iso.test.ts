import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimKmsCiphertextBlob } from "./sim-kms-ciphertext-blob.js";
import { SimKmsSigningKeyMaterial } from "./sim-kms-signing-key-material.js";
import { SimKmsSymmetricKeyMaterial } from "./sim-kms-symmetric-key-material.js";
import { simKmsSymmetricKeySpec } from "./spec/sim-kms-key-specs.js";
import { SimKmsSigningAlgorithm } from "./spec/sim-kms-signing-algorithm.js";
import { simKmsKeySpecs } from "./spec/sim-kms-key-specs.js";
import { SimKmsInvalidKeyUsageException } from "../error/sim-kms.error.js";
import { assertNonNullable } from "@kensio/smartass";

const keyArn = "arn:aws:kms:eu-west-2:123456789012:key/a-key";
const ecdsa = new SimKmsSigningAlgorithm({
  name: "ECDSA_SHA_256",
  digest: "sha256",
});

function symmetricMaterial(): SimKmsSymmetricKeyMaterial {
  return new SimKmsSymmetricKeyMaterial({
    keyArn,
    keySpec: simKmsSymmetricKeySpec,
    blob: new SimKmsCiphertextBlob(),
  });
}

function signingMaterial(): SimKmsSigningKeyMaterial {
  const keySpec = simKmsKeySpecs.get("ECC_NIST_P256");
  assertNonNullable(keySpec);

  return new SimKmsSigningKeyMaterial({ keyArn, keySpec });
}

/**
 * The key spec refuses most of these before the material is ever asked, so
 * these cover the material's own answer directly. It is the last line rather
 * than the first, and a key material that quietly did the wrong thing here
 * would be the worst kind of bug to have.
 */
describe("KMS key material by key usage", () => {
  it("refuses to sign with symmetric key material", () => {
    // Given symmetric AES key material.
    // When it is asked to sign, then it refuses for its key usage.
    const error = assertThrowsError(() =>
      symmetricMaterial().sign(new Uint8Array([1]), ecdsa),
    );

    assertInstanceOf(error, SimKmsInvalidKeyUsageException);
    assertStringIncludes(error.message, "Sign cannot be used with key");
  });

  it("refuses to verify with symmetric key material", () => {
    // Given symmetric AES key material.
    // When it is asked to verify, then it refuses.
    const error = assertThrowsError(() =>
      symmetricMaterial().verify(
        new Uint8Array([1]),
        new Uint8Array([2]),
        ecdsa,
      ),
    );

    assertInstanceOf(error, SimKmsInvalidKeyUsageException);
  });

  it("refuses to decrypt with signing key material", () => {
    // Given an asymmetric key pair.
    // When it is asked to decrypt, then it refuses.
    const error = assertThrowsError(() =>
      signingMaterial().decrypt({
        keyArn,
        iv: new Uint8Array(12),
        authTag: new Uint8Array(16),
        ciphertext: new Uint8Array(1),
      }),
    );

    assertInstanceOf(error, SimKmsInvalidKeyUsageException);
    assertStringIncludes(error.message, "Decrypt cannot be used with key");
  });
});
