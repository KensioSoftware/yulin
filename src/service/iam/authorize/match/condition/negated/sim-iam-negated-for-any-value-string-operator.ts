import type { SimIamConditionValue } from "../../../../policy/sim-iam-policy.js";
import type { SimIamConditionOperator } from "../sim-iam-condition-operator.js";
import type { SimIamStringComparison } from "../sim-iam-string-comparison.js";
import { simIamStringValues } from "../string/sim-iam-string-values.js";

/**
 * A `ForAnyValue` negated IAM string operator, such as
 * `ForAnyValue:StringNotEquals`.
 *
 * One request value differing from every policy value is enough. A request
 * supplying no values at all satisfies nothing, so an empty set does not
 * match, while an absent key does.
 */
export class SimIamNegatedForAnyValueStringOperator implements SimIamConditionOperator {
  readonly matchesAbsentKey = true;

  constructor(private readonly comparison: SimIamStringComparison) {}

  /**
   * Check whether any request value differs from every policy value.
   */
  matches(
    actual: SimIamConditionValue,
    expected: SimIamConditionValue,
  ): boolean {
    const actualValues = simIamStringValues(actual);
    const expectedValues = simIamStringValues(expected);

    if (actualValues === undefined || expectedValues === undefined) {
      return false;
    }

    return actualValues.some((actualValue) =>
      expectedValues.every(
        (expectedValue) => !this.comparison(actualValue, expectedValue),
      ),
    );
  }
}
