import type { SimIamAuthorizationInput } from "./context/sim-iam-auth-z-context-builder.js";
import type { SimIamPolicyDecision } from "./sim-iam-decision.js";

/**
 * IAM authorization capability consumed by other simulated AWS services.
 *
 * SimIam structurally implements this interface without requiring consumers to
 * depend on the complete IAM service facade.
 */
export interface SimIamInterServiceAuthZ {
  authorize(input: SimIamAuthorizationInput): SimIamPolicyDecision;
}
