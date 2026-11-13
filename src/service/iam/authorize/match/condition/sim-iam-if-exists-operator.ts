import type { SimIamConditionValue } from "../../../policy/sim-iam-policy.js";
import type { SimIamConditionOperator } from "./sim-iam-condition-operator.js";

/**
 * An operator carrying the `IfExists` suffix, such as `StringLikeIfExists`.
 *
 * A request carrying no value for the key matches. A request carrying one is
 * compared as the operator without the suffix would compare it. AWS allows
 * the suffix on every operator but `Null`.
 */
export class SimIamIfExistsOperator implements SimIamConditionOperator {
  constructor(private readonly operator: SimIamConditionOperator) {}

  /**
   * Answer for a request carrying no value for the key.
   */
  matchesAbsentKey(): boolean {
    return true;
  }

  /**
   * Answer for a request carrying a value for the key.
   */
  matches(
    actual: SimIamConditionValue,
    expected: SimIamConditionValue,
  ): boolean {
    return this.operator.matches(actual, expected);
  }
}
