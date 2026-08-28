import type { SimIamPolicyDocumentStatement } from "../../policy/sim-iam-policy.js";
import type { SimIamAuthZPolicySource } from "../context/sim-iam-auth-z-context.js";
import type { SimIamUnevaluatedStatement } from "./sim-iam-unevaluated-statement.type.js";

/**
 * The statements one authorization decision could not evaluate.
 *
 * Sim IAM implements the condition operators multi-service tests need and
 * fails closed on the rest, which leaves a statement it cannot read matching
 * nothing. On a Deny that reads as an allow, and the decision otherwise looks
 * healthy. Collecting the skips here is what lets a decision say that it
 * reached its answer without reading everything the policies said.
 *
 * A statement recorded twice is kept once. One policy attached at two levels
 * of an organization is one statement going unread, however many levels
 * reached it.
 */
export class SimIamUnevaluatedStatements {
  private readonly records: SimIamUnevaluatedStatement[] = [];

  /**
   * Every statement left unevaluated, in the order they were reached.
   */
  get all(): readonly SimIamUnevaluatedStatement[] {
    return this.records;
  }

  /**
   * Record a statement the simulator could not decide.
   */
  record(
    policy: SimIamAuthZPolicySource,
    statement: SimIamPolicyDocumentStatement,
    reason: string,
  ): void {
    const already = this.records.some(
      (record) => record.statement === statement && record.reason === reason,
    );

    if (already) {
      return;
    }

    this.records.push({
      policy: this.policyName(policy),
      sourceType: policy.sourceType,
      statement,
      reason,
    });
  }

  /**
   * What to call the policy a statement came from.
   */
  private policyName(policy: SimIamAuthZPolicySource): string {
    return policy.policyName ?? policy.resourceArn ?? policy.sourceType;
  }
}
