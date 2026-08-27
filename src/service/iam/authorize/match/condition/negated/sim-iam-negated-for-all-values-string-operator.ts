import type { SimIamConditionValue } from "../../../../policy/sim-iam-policy.js";
import type { SimIamConditionOperator } from "../sim-iam-condition-operator.js";
import type { SimIamStringComparison } from "../sim-iam-string-comparison.js";
import { simIamStringValues } from "../string/sim-iam-string-values.js";

/**
 * A `ForAllValues` negated IAM string operator, such as
 * `ForAllValues:StringNotEquals`.
 *
 * Every request value has to differ from every policy value. A request
 * supplying no values leaves nothing to contradict that, so an empty set
 * matches, as an absent key does.
 */
export class SimIamNegatedForAllValuesStringOperator implements SimIamConditionOperator {
  readonly matchesAbsentKey = true;

  constructor(private readonly comparison: SimIamStringComparison) {}

  /**
   * Check whether every request value differs from every policy value.
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

    return actualValues.every((actualValue) =>
      expectedValues.every(
        (expectedValue) => !this.comparison(actualValue, expectedValue),
      ),
    );
  }
}
