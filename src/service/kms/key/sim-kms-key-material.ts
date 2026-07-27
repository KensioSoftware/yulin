import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { SimKmsInvalidCiphertextException } from "../error/sim-kms.error.js";
import {
  SimKmsCiphertextBlobParts,
  type SimKmsCiphertextBlob,
} from "./sim-kms-ciphertext-blob.js";
import {
  SimKmsEncryptionContextAad,
  type SimKmsEncryptionContext,
} from "./sim-kms-encryption-context.js";

/**
 * The cipher backing a simulated symmetric KMS key.
 *
 * Real KMS symmetric keys are AES-256-GCM, so this uses the same thing rather
 * than a stand-in. Encryption in this simulation is real encryption: a
 * ciphertext genuinely cannot be read without the key, and the authentication
 * tag genuinely fails on a tampered blob or a mismatched encryption context.
 */
const algorithm = "aes-256-gcm";

const keyLength = 32;
const ivLength = 12;

interface SimKmsKeyMaterialProperties {
  readonly keyArn: string;
  readonly blob: SimKmsCiphertextBlob;
  readonly bytes?: Uint8Array | undefined;
}

/**
 * The key material of one simulated KMS key, and the operations that use it.
 *
 * The bytes are generated here and never leave: nothing exposes them, exactly
 * as real key material never leaves KMS. That is a modelling choice rather
 * than a security boundary, since this all runs in one process and anything
 * sharing that process can reach the object.
 */
export class SimKmsKeyMaterial {
  private readonly keyArn: string;
  private readonly blob: SimKmsCiphertextBlob;
  private readonly bytes: Uint8Array;
  private readonly aad = new SimKmsEncryptionContextAad();

  constructor(properties: SimKmsKeyMaterialProperties) {
    this.keyArn = properties.keyArn;
    this.blob = properties.blob;
    this.bytes = properties.bytes ?? randomBytes(keyLength);
  }

  /**
   * Encrypt plaintext under this key, binding the encryption context.
   */
  encrypt(
    plaintext: Uint8Array,
    encryptionContext?: SimKmsEncryptionContext,
  ): Uint8Array {
    const iv = randomBytes(ivLength);
    const cipher = createCipheriv(algorithm, this.bytes, iv);
    cipher.setAAD(this.aad.serialise(encryptionContext));

    const ciphertext = Buffer.concat([
      cipher.update(plaintext),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    return this.blob.encode(
      new SimKmsCiphertextBlobParts({
        keyArn: this.keyArn,
        iv: Uint8Array.from(iv),
        authTag: Uint8Array.from(authTag),
        ciphertext: Uint8Array.from(ciphertext),
      }),
    );
  }

  /**
   * Decrypt a ciphertext produced under this key.
   *
   * A wrong encryption context fails the GCM authentication tag rather than an
   * explicit comparison, so the failure comes from the cipher for the same
   * reason it does on real KMS.
   */
  decrypt(
    parts: SimKmsCiphertextBlobParts,
    encryptionContext?: SimKmsEncryptionContext,
  ): Uint8Array {
    const decipher = createDecipheriv(algorithm, this.bytes, parts.iv);
    decipher.setAAD(this.aad.serialise(encryptionContext));
    decipher.setAuthTag(parts.authTag);

    try {
      return Uint8Array.from(
        Buffer.concat([decipher.update(parts.ciphertext), decipher.final()]),
      );
    } catch {
      throw new SimKmsInvalidCiphertextException(
        "The ciphertext could not be decrypted: it was produced under a " +
          "different key, with a different encryption context, or has been " +
          "altered",
      );
    }
  }
}
