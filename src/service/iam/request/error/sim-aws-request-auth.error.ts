import { SimIamSigV4Error } from "../../sigv4/error/sim-iam-sigv4.error.js";

/**
 * Raised when the `x-sim-aws-caller` header does not name a principal the
 * simulator understands.
 *
 * This is a simulator control header rather than anything real AWS defines, so
 * a bad value is the caller's mistake in using Yulin, not a failed AWS
 * authentication. Saying exactly what the grammar is beats silently falling
 * back to anonymous and leaving a test wondering why its principal vanished.
 */
export class SimAwsInvalidCallerHeader extends Error {
  public readonly code = "InvalidRequestCaller";

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * Every way a request can fail to be attributed to a principal.
 *
 * A rejected signature and an unusable caller header are both authentication
 * failures at the same boundary, so whoever turns one into an HTTP response
 * handles them together.
 */
export type SimAwsRequestAuthFailure =
  | SimIamSigV4Error
  | SimAwsInvalidCallerHeader;

/**
 * Whether an error is a request authentication failure.
 */
export function isSimAwsRequestAuthFailure(
  error: unknown,
): error is SimAwsRequestAuthFailure {
  return (
    error instanceof SimIamSigV4Error ||
    error instanceof SimAwsInvalidCallerHeader
  );
}
