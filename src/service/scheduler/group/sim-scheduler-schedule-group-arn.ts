import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";

/**
 * The ARN of one simulated schedule group.
 *
 * `arn:aws:scheduler:<region>:<account>:schedule-group/<name>`. That is a
 * different resource path from a schedule's `schedule/<group>/<name>`. An
 * execution role is often written against this one, since a policy naming the
 * group covers every schedule that will ever be put in it.
 */
export function schedulerScheduleGroupArn(
  groupName: string,
  scope: SimAwsAccountRegionScope,
): string {
  return (
    `arn:aws:scheduler:${scope.regionName}:${scope.accountId}:` +
    `schedule-group/${groupName}`
  );
}
