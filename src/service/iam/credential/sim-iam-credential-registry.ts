import type {
  SimAwsCredentials,
  SimIamCredentialIdentity,
} from "./sim-aws-credentials.js";
import type { SimIamAccessKey } from "./sim-iam-access-key.js";
import {
  SimIamDuplicateAccessKey,
  SimIamInvalidCredentials,
} from "./error/sim-iam-credential.error.js";

/**
 * Stores and authenticates simulated IAM access keys.
 *
 * The registry is deliberately agnostic about the principal type represented
 * by an access key. Temporary sessions and future IAM-user access keys share
 * the same lookup and authentication behavior.
 */
export class SimIamCredentialRegistry {
  private readonly accessKeys = new Map<string, SimIamAccessKey>();

  /**
   * Register a new simulated access key.
   */
  registerAccessKey(accessKey: SimIamAccessKey): void {
    if (this.accessKeys.has(accessKey.accessKeyId)) {
      throw new SimIamDuplicateAccessKey(accessKey.accessKeyId);
    }

    this.accessKeys.set(accessKey.accessKeyId, accessKey);
  }

  /**
   * Authenticate credentials and resolve their simulated AWS identity.
   */
  resolve(
    credentials: SimAwsCredentials,
    now: Date = new Date(),
  ): SimIamCredentialIdentity {
    const accessKey = this.accessKeys.get(credentials.accessKeyId);

    if (accessKey === undefined) {
      throw new SimIamInvalidCredentials({
        accessKeyId: credentials.accessKeyId,
        reason: "unknown-access-key",
      });
    }

    if (accessKey.status !== "Active") {
      throw new SimIamInvalidCredentials({
        accessKeyId: credentials.accessKeyId,
        reason: "inactive-access-key",
        accessKeyStatus: accessKey.status,
      });
    }

    if (!accessKey.matchesSecretAccessKey(credentials.secretAccessKey)) {
      throw new SimIamInvalidCredentials({
        accessKeyId: credentials.accessKeyId,
        reason: "secret-access-key-mismatch",
      });
    }

    if (
      accessKey.session !== undefined &&
      credentials.sessionToken === undefined
    ) {
      throw new SimIamInvalidCredentials({
        accessKeyId: credentials.accessKeyId,
        reason: "session-token-missing",
      });
    }

    if (
      accessKey.session === undefined &&
      credentials.sessionToken !== undefined
    ) {
      throw new SimIamInvalidCredentials({
        accessKeyId: credentials.accessKeyId,
        reason: "session-token-unexpected",
      });
    }

    if (
      accessKey.session !== undefined &&
      !accessKey.matchesSessionToken(credentials.sessionToken)
    ) {
      throw new SimIamInvalidCredentials({
        accessKeyId: credentials.accessKeyId,
        reason: "session-token-mismatch",
      });
    }

    if (accessKey.session?.isExpired(now) === true) {
      throw new SimIamInvalidCredentials({
        accessKeyId: credentials.accessKeyId,
        reason: "expired-session",
        expiration: accessKey.session.expiration,
      });
    }

    return accessKey.identity();
  }
}
