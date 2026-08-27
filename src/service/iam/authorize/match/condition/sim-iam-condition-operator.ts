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
   * Whether the operator matches a request carrying no value for the key.
   *
   * An unqualified positive operator has nothing to compare and matches
   * nothing, while its negated form matches. With no value in the request
   * there is none for the policy value to equal.
   *
   * A `ForAnyValue` operator answers false whatever it wraps, because no
   * request value is there to satisfy it. AWS documents both rules.
   */
  readonly matchesAbsentKey: boolean;

  /**
   * Determine whether an actual request value satisfies the expected policy value.
   */
  matches(
    actual: SimIamConditionValue,
    expected: SimIamConditionValue,
  ): boolean;
}

/**
 * Builds a fresh condition operator for one keyword.
 */
export type SimIamConditionOperatorFactory = () => SimIamConditionOperator;
