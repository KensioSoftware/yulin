import { SimIamInvalidCredentials } from "./error/sim-iam-credential.error.js";
import type { SimIamAccessKey } from "./sim-iam-access-key.js";

/**
 * The rules deciding whether an access key may be used right now.
 *
 * These are separate from the registry that stores keys: the registry answers
 * which key an id names, and this answers whether that key is usable. Both the
 * secret-carrying and the signature-carrying paths into IAM apply the same
 * rules, in the same order, from here.
 */
export class SimIamAccessKeyChecks {
  /**
   * Resolve a looked-up access key, failing when it is unknown or deactivated.
   */
  activeAccessKey(
    accessKey: SimIamAccessKey | undefined,
    context: { readonly accessKeyId: string },
  ): SimIamAccessKey {
    if (accessKey === undefined) {
      throw new SimIamInvalidCredentials({
        accessKeyId: context.accessKeyId,
        reason: "unknown-access-key",
      });
    }

    if (accessKey.status !== "Active") {
      throw new SimIamInvalidCredentials({
        accessKeyId: context.accessKeyId,
        reason: "inactive-access-key",
        accessKeyStatus: accessKey.status,
      });
    }

    return accessKey;
  }

  /**
   * Check a presented session token belongs to the access key.
   *
   * A temporary key without its token, and a long-lived key with one, are both
   * refused: the two kinds of credential are not interchangeable.
   */
  checkSessionToken(
    accessKey: SimIamAccessKey,
    sessionToken: string | undefined,
  ): void {
    if (accessKey.session !== undefined && sessionToken === undefined) {
      throw this.invalid(accessKey, "session-token-missing");
    }

    if (accessKey.session === undefined && sessionToken !== undefined) {
      throw this.invalid(accessKey, "session-token-unexpected");
    }

    if (
      accessKey.session !== undefined &&
      !accessKey.matchesSessionToken(sessionToken)
    ) {
      throw this.invalid(accessKey, "session-token-mismatch");
    }
  }

  /**
   * Check a temporary key's session has not expired, in simulated time.
   */
  checkNotExpired(accessKey: SimIamAccessKey, now: Date): void {
    if (accessKey.session?.isExpired(now) === true) {
      throw new SimIamInvalidCredentials({
        accessKeyId: accessKey.accessKeyId,
        reason: "expired-session",
        expiration: accessKey.session.expiration,
      });
    }
  }

  private invalid(
    accessKey: SimIamAccessKey,
    reason:
      | "session-token-mismatch"
      | "session-token-missing"
      | "session-token-unexpected",
  ): SimIamInvalidCredentials {
    return new SimIamInvalidCredentials({
      accessKeyId: accessKey.accessKeyId,
      reason,
    });
  }
}
