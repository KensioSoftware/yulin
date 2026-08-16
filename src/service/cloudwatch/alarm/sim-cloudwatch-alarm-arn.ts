import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";

/**
 * The ARN of an alarm.
 *
 * Alarms are the one thing in CloudWatch that has an ARN: a metric has none,
 * which is why every metric action authorizes against `*`, while an alarm can
 * be named by a policy and is what `DescribeAlarms` reports.
 */
export function simCloudWatchAlarmArn(
  scope: SimAwsAccountRegionScope,
  alarmName: string,
): string {
  return `arn:aws:cloudwatch:${scope.regionName}:${scope.accountId}:alarm:${alarmName}`;
}
