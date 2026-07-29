import { SimKmsError } from "../../kms/error/sim-kms.error.js";
import {
  SimSecretsManagerDecryptionFailure,
  SimSecretsManagerEncryptionFailure,
  type SimSecretsManagerError,
} from "../error/sim-secrets-manager.error.js";

/**
 * Which way round a KMS call went wrong, since Secrets Manager has an error
 * for each.
 */
export type SimSecretsManagerKeyFailure = "encrypting" | "decrypting";

/**
 * Run a KMS call, reporting a refusal about the key the way Secrets Manager
 * reports it.
 *
 * Every key problem KMS raises becomes EncryptionFailure or DecryptionFailure
 * carrying the KMS message, which is what real Secrets Manager does for a key
 * that is missing, disabled or pending deletion. An access denial is not a KMS
 * error and passes through untouched, so a missing `kms:Decrypt` still reads
 * as a denial rather than a broken key.
 */
export async function reportingKeyProblems<TResult>(
  failure: SimSecretsManagerKeyFailure,
  call: () => Promise<TResult>,
): Promise<TResult> {
  try {
    return await call();
  } catch (error: unknown) {
    if (error instanceof SimKmsError) {
      throw keyFailure(failure, error.message);
    }

    throw error;
  }
}

function keyFailure(
  failure: SimSecretsManagerKeyFailure,
  message: string,
): SimSecretsManagerError {
  if (failure === "encrypting") {
    return new SimSecretsManagerEncryptionFailure(
      `Secrets Manager cannot encrypt the secret value with its KMS key: ${message}`,
    );
  }

  return new SimSecretsManagerDecryptionFailure(
    `Secrets Manager cannot decrypt the secret value with its KMS key: ${message}`,
  );
}
