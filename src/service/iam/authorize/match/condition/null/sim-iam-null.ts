import type { SimIamConditionValue } from "../../../../policy/sim-iam-policy.js";
import type { SimIamConditionOperator } from "../sim-iam-condition-operator.js";

/**
 * Read the policy value of a `Null` condition.
 *
 * AWS documents `"true"` and `"false"` as strings, which is the form a policy
 * document and the CDK both write. The condition value type also admits a JSON
 * boolean, and a policy written that way means the same thing. Anything else
 * has no meaning here and leaves the condition matching nothing.
 */
function expectsAbsentKey(expected: SimIamConditionValue): boolean | undefined {
  if (typeof expected === "boolean") {
    return expected;
  }

  if (expected === "true") {
    return true;
  }

  return expected === "false" ? false : undefined;
}

/**
 * Whether a request value counts as present for a `Null` check.
 *
 * AWS asks whether the key exists and its value is not null. A multi-valued key
 * carrying no values resolves to a null dataset, and an empty string is the
 * example AWS gives of one.
 */
function isPresent(actual: SimIamConditionValue): boolean {
  if (Array.isArray(actual)) {
    return actual.length > 0;
  }

  return actual !== "";
}

/**
 * IAM `Null` condition operator.
 *
 * `Null` checks whether the request carries a value for a context key, rather
 * than comparing one. `"true"` matches where the key is absent and `"false"`
 * where it is present. AWS names it and the `...IfExists` suffix as the two
 * exceptions to the rule that an absent key fails a condition.
 *
 * It is what guards a `ForAllValues` `Allow`, which matches an absent key on
 * its own. See `SimIamForAllValuesStringConditionOperator`.
 */
export class SimIamNull implements SimIamConditionOperator {
  /**
   * Answer for a request carrying no value for the key.
   */
  matchesAbsentKey(expected: SimIamConditionValue): boolean {
    return expectsAbsentKey(expected) === true;
  }

  /**
   * Answer for a request carrying a value for the key.
   */
  matches(
    actual: SimIamConditionValue,
    expected: SimIamConditionValue,
  ): boolean {
    const absentExpected = expectsAbsentKey(expected);

    if (absentExpected === undefined) {
      return false;
    }

    return absentExpected !== isPresent(actual);
  }
}
