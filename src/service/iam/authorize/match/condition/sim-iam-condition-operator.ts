import type { SimIamConditionValue } from "../../../policy/sim-iam-policy.js";

/**
 * Contract implemented by every simulated IAM condition operator.
 *
 * Implementations own operand validation and comparison semantics. Condition
 * document traversal and context-key lookup are handled by the policy condition
 * matcher.
 */
export interface SimIamConditionOperator {
  /**
   * Determine whether an actual request value satisfies the expected policy value.
   */
  matches(
    actual: SimIamConditionValue,
    expected: SimIamConditionValue,
  ): boolean;
}
