import type { SimIamPolicyDocumentStatement } from "../../policy/sim-iam-policy.js";
import type { SimIamAuthZPolicySourceType } from "../context/sim-iam-auth-z-context.js";

/**
 * One policy statement an authorization decision could not evaluate.
 *
 * The statement applied to the request as far as the simulator could tell:
 * its Principal, Action and Resource all matched, and only its Condition was
 * left undecided. Sim IAM fails closed, and the statement matched nothing. A
 * Deny that would have stopped the request in a real account lets it through
 * here.
 *
 * That is why this is recorded. A decision reporting an ordinary Allow over a
 * statement nothing could read is an allow for the wrong reason, and a test
 * asserting on it needs somewhere to find that out.
 */
export interface SimIamUnevaluatedStatement {
  /**
   * The policy the statement came from.
   *
   * This is the policy's name, falling back to the ARN of the resource
   * holding it, and then to how the policy reached the request, since a
   * resource policy supplied by a service need not name itself.
   */
  readonly policy: string;

  /** Where the policy came from, e.g. `service-control`. */
  readonly sourceType: SimIamAuthZPolicySourceType;

  /** The statement, as its policy document declared it. */
  readonly statement: SimIamPolicyDocumentStatement;

  /** Why the simulator could not tell whether the statement matched. */
  readonly reason: string;
}
