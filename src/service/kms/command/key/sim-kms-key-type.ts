import {
  SimKmsInvalidKeyUsageException,
  SimKmsValidationException,
} from "../../error/sim-kms.error.js";

/**
 * The only key type this simulation models.
 */
const symmetricKeySpec = "SYMMETRIC_DEFAULT";
const encryptDecryptUsage = "ENCRYPT_DECRYPT";
const kmsOrigin = "AWS_KMS";

/**
 * Checks a requested key type against what this simulation models.
 *
 * Asymmetric keys, HMAC keys and imported material all behave differently
 * enough that pretending a symmetric key is one of them would make a passing
 * test meaningless, so an unmodelled type is refused rather than substituted.
 */
export class SimKmsKeyType {
  /**
   * Refuse a key type this simulation does not model.
   */
  require(
    keyUsage: string | undefined,
    keySpec: string | undefined,
    origin: string | undefined,
  ): void {
    if (keyUsage !== undefined && keyUsage !== encryptDecryptUsage) {
      throw new SimKmsInvalidKeyUsageException(
        `KeyUsage '${keyUsage}' is not simulated: simulated KMS creates ${encryptDecryptUsage} keys`,
      );
    }

    if (keySpec !== undefined && keySpec !== symmetricKeySpec) {
      throw new SimKmsInvalidKeyUsageException(
        `KeySpec '${keySpec}' is not simulated: simulated KMS creates ${symmetricKeySpec} keys`,
      );
    }

    if (origin !== undefined && origin !== kmsOrigin) {
      throw new SimKmsValidationException(
        `Origin '${origin}' is not simulated: simulated KMS generates its own key material`,
      );
    }
  }
}
