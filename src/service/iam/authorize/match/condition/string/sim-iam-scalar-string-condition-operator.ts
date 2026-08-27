import type { SimIamConditionValue } from "../../../../policy/sim-iam-policy.js";
import type { SimIamConditionOperator } from "../sim-iam-condition-operator.js";
import { simIamStringValues } from "./sim-iam-string-values.js";

/**
 * Base for unqualified IAM string operators.
 *
 * Unqualified operators require a scalar request value. Policy values may be a
 * scalar or an array, with multiple policy values using OR semantics.
 */
export abstract class SimIamScalarStringConditionOperator implements SimIamConditionOperator {
  readonly matchesAbsentKey = false;

  /**
   * Check whether a given value matches the expected value.
   */
  matches(
    actual: SimIamConditionValue,
    expected: SimIamConditionValue,
  ): boolean {
    if (typeof actual !== "string") {
      return false;
    }

    const expectedValues = simIamStringValues(expected);

    return Boolean(
      expectedValues?.some((expectedValue) =>
        this.valueMatches(actual, expectedValue),
      ),
    );
  }

  protected abstract valueMatches(actual: string, expected: string): boolean;
}
