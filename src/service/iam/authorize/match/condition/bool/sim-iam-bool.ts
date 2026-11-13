import type { SimIamConditionValue } from "../../../../policy/sim-iam-policy.js";
import type { SimIamConditionOperator } from "../sim-iam-condition-operator.js";

/**
 * Read one value as a boolean, the way IAM reads a `Bool` condition.
 *
 * A policy document writes `"true"` and `"false"` as strings, case aside, and
 * a request value or a hand-written policy can carry a JSON boolean. Anything
 * else is no boolean at all.
 */
function booleanOf(value: SimIamConditionValue): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const lowered = value.toLowerCase();

  if (lowered === "true") {
    return true;
  }

  return lowered === "false" ? false : undefined;
}

/**
 * IAM `Bool` condition operator.
 *
 * It matches when the request's value equals one of the policy's. A request
 * carrying no value for the key matches nothing, which is why AWS pairs
 * `"aws:SecureTransport": "false"` with a Deny rather than an Allow.
 */
export class SimIamBool implements SimIamConditionOperator {
  /**
   * Answer for a request carrying no value for the key.
   */
  matchesAbsentKey(): boolean {
    return false;
  }

  /**
   * Answer for a request carrying a value for the key.
   */
  matches(
    actual: SimIamConditionValue,
    expected: SimIamConditionValue,
  ): boolean {
    const requested = booleanOf(actual);

    if (requested === undefined) {
      return false;
    }

    const expectedValues: readonly SimIamConditionValue[] =
      typeof expected === "object" ? expected : [expected];

    return expectedValues.some((value) => booleanOf(value) === requested);
  }
}
