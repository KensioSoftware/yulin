import type { SimIamConditionValue } from "../../../iam/policy/sim-iam-policy.js";

/**
 * The condition values a request carrying tags gives a policy to read:
 * `aws:RequestTag/<key>` for each tag, and `aws:TagKeys` listing the keys.
 *
 * A request naming keys alone, as UntagResource does, gives `aws:TagKeys`
 * only. A request with no tags gives nothing, so a policy conditioned on
 * either key does not match it.
 */
export function simLambdaRequestTagConditions(
  tags: Readonly<Record<string, string>> = {},
  keys: readonly string[] = Object.keys(tags),
): Readonly<Record<string, SimIamConditionValue>> {
  if (keys.length === 0) {
    return {};
  }

  return {
    ...Object.fromEntries(
      Object.entries(tags).map(([key, value]) => [
        `aws:RequestTag/${key}`,
        value,
      ]),
    ),
    "aws:TagKeys": keys,
  };
}
