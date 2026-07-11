import type { SimIamConditionValue } from "../../../../../policy/sim-iam-policy.js";
import type { SimIamConditionOperator } from "../../sim-iam-condition-operator.js";
import { simIamStringValues } from "../sim-iam-string-values.js";

/**
 * Base for `ForAnyValue` IAM string operators.
 */
export abstract class SimIamForAnyValueStringConditionOperator implements SimIamConditionOperator {
  /**
   * Check whether a given value matches the expected value.
   */
  matches(
    actual: SimIamConditionValue,
    expected: SimIamConditionValue,
  ): boolean {
    const actualValues = simIamStringValues(actual);
    const expectedValues = simIamStringValues(expected);

    if (
      actualValues === undefined ||
      expectedValues === undefined ||
      actualValues.length === 0 ||
      expectedValues.length === 0
    ) {
      return false;
    }

    return actualValues.some((actualValue) =>
      expectedValues.some((expectedValue) =>
        this.valueMatches(actualValue, expectedValue),
      ),
    );
  }

  protected abstract valueMatches(actual: string, expected: string): boolean;
}
