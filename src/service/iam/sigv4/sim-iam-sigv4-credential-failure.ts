import { SimIamInvalidCredentials } from "../credential/error/sim-iam-credential.error.js";
import type { SimIamInvalidCredentialsReason } from "../credential/error/sim-iam-credential.error.js";
import {
  SimIamExpiredToken,
  SimIamInvalidClientTokenId,
  SimIamSignatureDoesNotMatch,
  type SimIamSigV4Error,
} from "./error/sim-iam-sigv4.error.js";

/**
 * Run a credential lookup, restating any rejection as the AWS error code a
 * signed request would be answered with.
 *
 * The registry reports why a credential failed in its own terms, which is the
 * useful vocabulary in process. Over the wire AWS has a smaller vocabulary, and
 * a client handling a real rejection expects those codes, so the translation
 * happens here rather than in the registry.
 */
export function simIamSigV4CredentialFailure<T>(
  accessKeyId: string,
  resolve: () => T,
): T {
  try {
    return resolve();
  } catch (error) {
    if (error instanceof SimIamInvalidCredentials) {
      throw sigV4Error(accessKeyId, error);
    }

    throw error;
  }
}

function sigV4Error(
  accessKeyId: string,
  error: SimIamInvalidCredentials,
): SimIamSigV4Error {
  const reason: SimIamInvalidCredentialsReason = error.reason;

  switch (reason) {
    case "expired-session": {
      return new SimIamExpiredToken(
        `The security token included in the request for access key ` +
          `${accessKeyId} has expired: ${error.message}`,
      );
    }
    case "secret-access-key-mismatch": {
      // A signed request never presents a secret, so reaching this means the
      // signature is what failed rather than the credential.
      return new SimIamSignatureDoesNotMatch(error.message);
    }
    case "inactive-access-key":
    case "session-token-mismatch":
    case "session-token-missing":
    case "session-token-unexpected":
    case "unknown-access-key": {
      return new SimIamInvalidClientTokenId(
        `The security token included in the request for access key ` +
          `${accessKeyId} is invalid: ${error.message}`,
      );
    }
  }
}
