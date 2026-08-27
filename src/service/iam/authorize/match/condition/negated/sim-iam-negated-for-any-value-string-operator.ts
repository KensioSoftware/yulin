import type { SimIamConditionValue } from "../../../../policy/sim-iam-policy.js";
import type { SimIamConditionOperator } from "../sim-iam-condition-operator.js";
import type { SimIamStringComparison } from "../sim-iam-string-comparison.js";
import { simIamStringValues } from "../string/sim-iam-string-values.js";

/**
 * A `ForAnyValue` negated IAM string operator, such as
 * `ForAnyValue:StringNotEquals`.
 *
 * One request value differing from every policy value is enough. A request
 * supplying no such value satisfies nothing, which covers both an empty value
 * set and a key the request omits. The `ForAnyValue` qualifier settles the
 * absent key here, ahead of the rule that a negated operator matches one.
 */
export class SimIamNegatedForAnyValueStringOperator implements SimIamConditionOperator {
  readonly matchesAbsentKey = false;

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
