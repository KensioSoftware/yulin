import type { SimAwsPrincipal } from "../../aws/caller/sim-aws-caller.js";

/**
 * Converts a simulated AWS principal into the identifier displayed in IAM
 * authorization error messages.
 *
 * Simulated principals use a discriminated union because each principal kind
 * stores its identifier in a different property. Keeping that mapping here
 * prevents IAM error classes from needing to understand every principal shape.
 *
 * The returned values follow the existing error-message format:
 *
 * - anonymous callers use the literal `anonymous`;
 * - ARN principals use their complete ARN;
 * - AWS service principals use their service name.
 *
 * Add handling here when a new principal kind is introduced so all IAM
 * authorization diagnostics continue to identify callers consistently.
 */
export class SimIamCallerIdentifier {
  /**
   * Return the human-readable identifier for one simulated AWS principal.
   */
  format(caller: SimAwsPrincipal): string {
    if (caller.kind === "anonymous") {
      return "anonymous";
    }

    if (caller.kind === "arn") {
      return caller.arn;
    }

    return caller.service;
  }
}
