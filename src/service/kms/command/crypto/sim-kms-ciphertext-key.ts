import {
  SimKmsIncorrectKeyException,
  SimKmsInvalidCiphertextException,
  SimKmsInvalidKeyUsageException,
} from "../../error/sim-kms.error.js";
import type { SimKmsKey } from "../../key/sim-kms-key.js";
import type { SimKmsKeyStore } from "../../key/sim-kms-key-store.js";

/**
 * The only encryption algorithm a symmetric KMS key supports.
 */
export const simKmsSymmetricAlgorithm = "SYMMETRIC_DEFAULT";

/**
 * Resolves the key behind a ciphertext, and checks the caller's expectations.
 *
 * Decrypt is the one KMS operation whose target key comes from the ciphertext
 * rather than the request, so working out which key that is, and what to say
 * when it is not the one the caller expected, is its own small job.
 */
export class SimKmsCiphertextKey {
  private readonly keys: SimKmsKeyStore;

  constructor(keys: SimKmsKeyStore) {
    this.keys = keys;
  }

  /**
   * Find the key a ciphertext was produced under.
   *
   * A blob naming a key this scope does not have is an unreadable ciphertext
   * rather than a missing key, because the caller never named the key and so
   * cannot be told which one is missing.
   */
  behind(keyArn: string): SimKmsKey {
    const key = this.keys.find(keyArn);

    if (key === undefined) {
      throw new SimKmsInvalidCiphertextException();
    }

    return key;
  }

  /**
   * Check a supplied KeyId against the key the ciphertext actually names.
   *
   * A KeyId naming no key at all is a missing key rather than the wrong one,
   * so it is resolved the same way every other operation resolves its target.
   */
  requireExpected(keyId: string | undefined, key: SimKmsKey): void {
    if (keyId === undefined) {
      return;
    }

    if (this.keys.require(keyId).keyId !== key.keyId) {
      throw new SimKmsIncorrectKeyException(
        `The ciphertext was not encrypted under the key '${keyId}'`,
      );
    }
  }

  /**
   * Refuse an encryption algorithm this simulation does not model.
   *
   * Only symmetric keys are simulated, so an asymmetric algorithm is refused
   * rather than quietly treated as the symmetric one.
   */
  requireSymmetricAlgorithm(algorithm: string | undefined): void {
    if (algorithm !== undefined && algorithm !== simKmsSymmetricAlgorithm) {
      throw new SimKmsInvalidKeyUsageException(
        `Encryption algorithm '${algorithm}' is not supported: simulated KMS keys are symmetric, which supports only ${simKmsSymmetricAlgorithm}`,
      );
    }
  }
}
