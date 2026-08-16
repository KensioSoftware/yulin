import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";

/**
 * The start of every CloudWatch Logs ARN in one account and region.
 */
export function simLogsArnPrefix(scope: SimAwsAccountRegionScope): string {
  return `arn:aws:logs:${scope.regionName}:${scope.accountId}:`;
}

/**
 * The ARN of a log group, without the trailing wildcard.
 *
 * This is what `DescribeLogGroups` reports as `logGroupArn`. The separator
 * before the name is a colon rather than a slash, so a name that starts with
 * one, as every Lambda log group does, gives an ARN with two of them in a row.
 * That is how real CloudWatch Logs writes it.
 */
export function simLogsLogGroupArn(
  scope: SimAwsAccountRegionScope,
  logGroupName: string,
): string {
  return `${simLogsArnPrefix(scope)}log-group:${logGroupName}`;
}

/**
 * The ARN of a log group with the trailing wildcard that covers the streams
 * inside it.
 *
 * Real CloudWatch Logs reports this as the `arn` field, and it is the form IAM
 * policies are written against: granting `logs:PutLogEvents` on a log group
 * means granting it on the streams the group holds, so the resource a write
 * authorizes against ends in `:*`.
 */
export function simLogsLogGroupWildcardArn(
  scope: SimAwsAccountRegionScope,
  logGroupName: string,
): string {
  return `${simLogsLogGroupArn(scope, logGroupName)}:*`;
}

/**
 * The ARN of every log group in one account and region.
 *
 * An operation that names no particular group authorizes against this, since
 * that is the resource it actually reaches.
 */
export function simLogsAnyLogGroupArn(scope: SimAwsAccountRegionScope): string {
  return `${simLogsArnPrefix(scope)}log-group:*`;
}

/**
 * The ARN of a log stream inside a log group.
 */
export function simLogsLogStreamArn(
  scope: SimAwsAccountRegionScope,
  logGroupName: string,
  logStreamName: string,
): string {
  return (
    `${simLogsLogGroupArn(scope, logGroupName)}:log-stream:${logStreamName}`
  );
}
