import {
  SimIamIncompleteSignature,
  SimIamPresignedRequestExpired,
} from "../error/sim-iam-sigv4.error.js";
import { simIamSigV4SignedAt } from "../sim-iam-sigv4-request-date.js";

/**
 * The longest window AWS will presign for, seven days in seconds.
 */
const maximumExpirySeconds = 604_800;

const secondsPattern = /^\d+$/;

/**
 * The window of time a presigned URL is usable in.
 *
 * A presigned URL is the one signed request that carries its own lifetime:
 * `X-Amz-Expires` says how many seconds after `X-Amz-Date` it stops working.
 * Both are signed, so neither can be stretched by whoever holds the URL.
 */
export class SimIamSigV4PresignedWindow {
  private readonly signedAt: Date;
  private readonly expiresSeconds: number;

  constructor(amzDate: string, expiresSeconds: number) {
    this.signedAt = simIamSigV4SignedAt(amzDate);
    this.expiresSeconds = expiresSeconds;
  }

  /**
   * Read the stated lifetime, refusing one AWS would not have signed.
   *
   * AWS caps a presigned lifetime at seven days, so a longer one cannot have
   * come from a signer this simulation should accept. Refusing it here is the
   * fail-closed answer: honouring it would let a test prove a URL works that
   * real S3 would never have issued.
   */
  static expirySeconds(value: string | undefined): number {
    if (value === undefined || value.length === 0) {
      throw new SimIamIncompleteSignature(
        "Presigned URL carries no X-Amz-Expires parameter",
      );
    }

    if (!secondsPattern.test(value)) {
      throw new SimIamIncompleteSignature(
        `Presigned URL X-Amz-Expires ${value} must be a whole number of seconds`,
      );
    }

    const seconds = Number(value);

    if (seconds < 1 || seconds > maximumExpirySeconds) {
      throw new SimIamIncompleteSignature(
        `Presigned URL X-Amz-Expires ${value} is outside the 1 to ` +
          `${String(maximumExpirySeconds)} seconds AWS signs for`,
      );
    }

    return seconds;
  }

  /**
   * The instant this URL stops working.
   */
  expiresAt(): Date {
    return new Date(this.signedAt.getTime() + this.expiresSeconds * 1000);
  }

  /**
   * Refuse a URL used after its window, in simulated time.
   */
  checkNotExpired(now: Date): void {
    const expiresAt = this.expiresAt();

    if (now.getTime() <= expiresAt.getTime()) {
      return;
    }

    throw new SimIamPresignedRequestExpired(
      `Request has expired. The presigned URL was signed at ` +
        `${this.signedAt.toISOString()} for ${String(this.expiresSeconds)} ` +
        `seconds, so it expired at ${expiresAt.toISOString()}, and simulated ` +
        `time is now ${now.toISOString()}.`,
    );
  }
}
