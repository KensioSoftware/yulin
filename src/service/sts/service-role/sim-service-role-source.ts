import type { SimIamConditionValue } from "../../iam/policy/sim-iam-policy.js";

/**
 * The resource a service says it is assuming a role for, as `aws:SourceArn`.
 */
export const simServiceRoleSourceArnConditionKey = "aws:SourceArn";

/**
 * The Account owning that resource, as `aws:SourceAccount`.
 */
export const simServiceRoleSourceAccountConditionKey = "aws:SourceAccount";

/**
 * Which of its own resources a service is assuming a role on behalf of.
 *
 * AWS recommends conditioning a service role's trust policy on these two
 * against the confused deputy problem, so that a role trusting
 * `scheduler.amazonaws.com` is assumable for one schedule group rather than by
 * Scheduler at large. Which resource counts is the service's own answer, and
 * differs between services: Scheduler names a schedule group and EventBridge
 * names a rule.
 */
export interface SimServiceRoleSource {
  readonly arn: string;
  readonly accountId: string;
}

/**
 * The request-time values a trust policy statement's conditions are matched
 * against.
 *
 * A service that states no source supplies neither key, so a trust policy
 * conditioned on either fails to match instead of matching an empty string.
 * That is the safe direction. A role scoped to one schedule group should refuse
 * an assume request that says nothing about which group it is for.
 */
export function simServiceRoleConditionContext(
  source: SimServiceRoleSource | undefined,
): Readonly<Record<string, SimIamConditionValue>> {
  if (source === undefined) {
    return {};
  }

  return {
    [simServiceRoleSourceArnConditionKey]: source.arn,
    [simServiceRoleSourceAccountConditionKey]: source.accountId,
  };
}
