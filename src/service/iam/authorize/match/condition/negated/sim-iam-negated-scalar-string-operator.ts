import type { SimIamConditionValue } from "../../../../policy/sim-iam-policy.js";
import type { SimIamConditionOperator } from "../sim-iam-condition-operator.js";
import type { SimIamStringComparison } from "../sim-iam-string-comparison.js";
import { simIamStringValues } from "../string/sim-iam-string-values.js";

/**
 * An unqualified negated IAM string operator, such as `StringNotEquals`.
 *
 * The request value must be scalar, as it must for the positive operators.
 * Several policy values are an AND rather than an OR: the request value has to
 * differ from every one of them, so a carve-out naming three roles exempts all
 * three.
 */
export class SimIamNegatedScalarStringOperator implements SimIamConditionOperator {
  readonly matchesAbsentKey = true;

  constructor(private readonly comparison: SimIamStringComparison) {}

  /**
   * Check whether a request value differs from every policy value.
   */
  matches(
    actual: SimIamConditionValue,
    expected: SimIamConditionValue,
  ): boolean {
    if (typeof actual !== "string") {
      return false;
    }

    const expectedValues = simIamStringValues(expected);

    if (expectedValues === undefined) {
      return false;
    }

    return expectedValues.every(
      (expectedValue) => !this.comparison(actual, expectedValue),
    );
  }
}
