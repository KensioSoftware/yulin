import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";

/**
 * The ARN of one simulated schedule group.
 *
 * `arn:aws:scheduler:<region>:<account>:schedule-group/<name>`. That is a
 * different resource path from a schedule's `schedule/<group>/<name>`. An
 * identity policy granting `scheduler:` actions on the group names this one,
 * and so does the `aws:SourceArn` condition AWS recommends in a schedule
 * execution role's trust policy.
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
