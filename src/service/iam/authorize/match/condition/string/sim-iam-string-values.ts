import type { SimIamConditionValue } from "../../../../policy/sim-iam-policy.js";

/**
 * Return a condition value as a string array.
 *
 * Non-string values fail validation instead of being coerced.
 */
export function simIamStringValues(
  value: SimIamConditionValue,
): readonly string[] | undefined {
  if (typeof value === "string") {
    return [value];
  }

  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.every((item): item is string => typeof item === "string")
    ? value
    : undefined;
}
