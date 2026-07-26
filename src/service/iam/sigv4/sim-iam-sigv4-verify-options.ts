import type { SimIamSigV4ExpectedScope } from "./sim-iam-sigv4-expected-scope.js";

/**
 * Anything verifying a signature needs beyond the request itself.
 */
export interface SimIamSigV4VerifyOptions {
  /**
   * The service and Region the signature should have been scoped to. Omitted
   * when nothing about the receiving endpoint is known, as when a test verifies
   * a signature on its own.
   */
  readonly expectedScope?: SimIamSigV4ExpectedScope | undefined;
  /**
   * Simulated time that credential expiry is judged against.
   */
  readonly now?: Date | undefined;
}
