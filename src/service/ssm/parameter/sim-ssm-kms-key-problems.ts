import { SimKmsError } from "../../kms/error/sim-kms.error.js";
import { SimSsmInvalidKeyId } from "../error/sim-ssm.error.js";

/**
 * Run a KMS call, reporting a refusal about the key the way Parameter Store
 * reports it.
 *
 * Every key problem KMS raises becomes InvalidKeyId carrying the KMS message,
 * which is what real Parameter Store does for a key that is missing, disabled
 * or pending deletion. An access denial is not a KMS error and passes through
 * untouched, so a missing `kms:Decrypt` still reads as a denial rather than a
 * bad key.
 */
export async function reportingKeyProblems<TResult>(
  call: () => Promise<TResult>,
): Promise<TResult> {
  try {
    return await call();
  } catch (error: unknown) {
    if (error instanceof SimKmsError) {
      throw new SimSsmInvalidKeyId(
        `The KMS key cannot be used for this parameter: ${error.message}`,
      );
    }

    throw error;
  }
}
