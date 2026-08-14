import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";

/**
 * The ARN of one simulated schedule.
 *
 * A schedule ARN names its group as well as itself:
 * `arn:aws:scheduler:<region>:<account>:schedule/<group>/<name>`. That is
 * unlike an EventBridge rule, whose ARN carries its bus only when the bus is
 * not the default one, and it is why a schedule in another group could not
 * simply be treated as one in `default`.
 */
export function schedulerScheduleArn(
  groupName: string,
  scheduleName: string,
  scope: SimAwsAccountRegionScope,
): string {
  return (
    `arn:aws:scheduler:${scope.regionName}:${scope.accountId}:` +
    `schedule/${groupName}/${scheduleName}`
  );
}
