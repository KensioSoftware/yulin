import {
  SimKmsInvalidKeyUsageException,
  SimKmsUnsupportedOperationException,
} from "../error/sim-kms.error.js";
import type { SimKmsSigningAlgorithm } from "./spec/sim-kms-signing-algorithm.js";
import type { SimKmsKeySpec } from "./spec/sim-kms-key-spec.js";
import type { SimKmsCiphertextBlobParts } from "./sim-kms-ciphertext-blob.js";
import type { SimKmsEncryptionContext } from "./sim-kms-encryption-context.js";

interface SimKmsKeyMaterialProperties {
  readonly keyArn: string;
  readonly keySpec: SimKmsKeySpec;
}

/**
 * The key material of one simulated KMS key, and the operations that use it.
 *
 * The bytes are generated in the subclass and never leave, exactly as real key
 * material never leaves KMS. That is a modelling choice rather than a security
 * boundary, since this all runs in one process and anything sharing that
 * process can reach the object.
 *
 * Every operation is declared here and refused by default, because that is how
 * AWS answers one: an `Encrypt` against a signing key is not an unknown
 * operation, it is `InvalidKeyUsageException` on a key that cannot do it. A
 * subclass overrides the operations its usage allows and inherits the refusal
 * for the rest.
 */
export abstract class SimKmsKeyMaterial {
  public readonly keySpec: SimKmsKeySpec;

  protected readonly keyArn: string;

  constructor(properties: SimKmsKeyMaterialProperties) {
    this.keyArn = properties.keyArn;
    this.keySpec = properties.keySpec;
  }

  /**
   * Encrypt plaintext under this key, binding the encryption context.
   */
  encrypt(
    _plaintext: Uint8Array,
    _encryptionContext?: SimKmsEncryptionContext,
  ): Uint8Array {
    throw this.notForThisUsage("Encrypt");
  }

  /**
   * Decrypt a ciphertext produced under this key.
   */
  decrypt(
    _parts: SimKmsCiphertextBlobParts,
    _encryptionContext?: SimKmsEncryptionContext,
  ): Uint8Array {
    throw this.notForThisUsage("Decrypt");
  }

  /**
   * Sign a message under this key.
   */
  sign(_message: Uint8Array, _algorithm: SimKmsSigningAlgorithm): Uint8Array {
    throw this.notForThisUsage("Sign");
  }

  /**
   * Check a signature made under this key.
   */
  verify(
    _message: Uint8Array,
    _signature: Uint8Array,
    _algorithm: SimKmsSigningAlgorithm,
  ): boolean {
    throw this.notForThisUsage("Verify");
  }

  /**
   * This key's public key, as DER SubjectPublicKeyInfo.
   *
   * A symmetric key has no public key at all, which real KMS reports as an
   * unsupported operation rather than as a key usage that does not allow it.
   */
  publicKeyDer(): Uint8Array {
    throw new SimKmsUnsupportedOperationException(
      `GetPublicKey cannot be used with key ${this.keyArn}: its KeySpec is ${this.keySpec.name}, which holds no public key`,
    );
  }

  /**
   * The refusal for an operation this key's usage does not allow.
   */
  private notForThisUsage(operation: string): SimKmsInvalidKeyUsageException {
    return new SimKmsInvalidKeyUsageException(
      `${operation} cannot be used with key ${this.keyArn}: its KeyUsage is ${this.keySpec.keyUsage}`,
    );
  }
}
