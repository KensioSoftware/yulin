import type {
  SimIamScalarConditionValue,
  SimIamValueComparison,
} from "./sim-iam-value-comparison.js";

/**
 * Read one value as a boolean, the way IAM reads a `Bool` condition.
 *
 * A policy document writes `"true"` and `"false"` as strings, case aside, and
 * a request value or a hand-written policy can carry a JSON boolean. Anything
 * else is no boolean at all.
 */
function booleanOf(value: SimIamScalarConditionValue): boolean | undefined {
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
 * The comparison `Bool` is built from.
 *
 * A request carrying no value for the key matches nothing, which is why AWS
 * pairs `"aws:SecureTransport": "false"` with a Deny.
 */
export const simIamBoolComparison: SimIamValueComparison = (
  actual,
  expected,
) => {
  const requested = booleanOf(actual);
  const written = booleanOf(expected);

  if (requested === undefined || written === undefined) {
    return;
  }

  return requested === written;
};
