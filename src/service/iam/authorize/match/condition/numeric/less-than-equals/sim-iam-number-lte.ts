import type { SimIamConditionValue } from "../../../../../policy/sim-iam-policy.js";
import type { SimIamConditionOperator } from "../../sim-iam-condition-operator.js";

/**
 * IAM `NumericLessThanEquals` condition operator.
 *
 * IAM policy documents and service request contexts may represent numeric
 * values as either JSON numbers or numeric strings. Both representations are
 * accepted here and compared numerically.
 *
 * The request value must be scalar. Multiple policy values use OR semantics:
 * the condition matches when the request value is less than or equal to at
 * least one valid policy value.
 *
 * Empty strings, booleans, arrays in the request context, and non-finite values
 * are rejected rather than being converted through JavaScript coercion rules.
 */
export class SimIamNumericLessThanEquals implements SimIamConditionOperator {
  readonly matchesAbsentKey = false;

  /**
   * Compare one request value with one or more policy limits.
   */
  matches(
    actual: SimIamConditionValue,
    expected: SimIamConditionValue,
  ): boolean {
    const actualNumber = this.numericValue(actual);
    if (actualNumber === undefined) {
      return false;
    }

    return this.expectedValues(expected).some(
      (expectedNumber) => actualNumber <= expectedNumber,
    );
  }

  /**
   * Normalize the scalar or array representation used by a policy document.
   *
   * The current policy value type permits arrays of strings, while scalar
   * values may also be numbers. Invalid entries do not participate in matching.
   */
  private expectedValues(value: SimIamConditionValue): readonly number[] {
    const values = Array.isArray(value) ? value : [value];

    return values
      .map((item: SimIamConditionValue): number | undefined =>
        this.numericValue(item),
      )
      .filter((item): item is number => item !== undefined);
  }

  /**
   * Parse a supported IAM numeric representation without broad coercion.
   */
  private numericValue(value: SimIamConditionValue): number | undefined {
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : undefined;
    }

    if (typeof value !== "string" || value.trim() === "") {
      return undefined;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
}
