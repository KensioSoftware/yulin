import type { SimIamConditionValue } from "../../policy/sim-iam-policy.js";

type SimIamConditions = Readonly<Record<string, SimIamConditionValue>>;

/**
 * The keys that describe the caller, which only IAM supplies.
 */
const principalKeys = new Set([
  "aws:principalaccount",
  "aws:principalisawsservice",
  "aws:principalservicename",
  "aws:principaltype",
  "aws:userid",
  "aws:username",
]);

/**
 * Drop the keys that describe the caller from values a service supplies.
 *
 * IAM derives these from the resolved caller. A supplied key the derived
 * values leave out, such as `aws:username` for a Role session, would
 * otherwise reach the policy.
 */
export function simIamWithoutPrincipalKeys(
  values: SimIamConditions | undefined,
): SimIamConditions {
  return Object.fromEntries(
    Object.entries(values ?? {}).filter(([key]) => {
      const lower = key.toLowerCase();

      return (
        !principalKeys.has(lower) && !lower.startsWith("aws:principaltag/")
      );
    }),
  );
}
