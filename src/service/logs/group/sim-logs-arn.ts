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
  return `${simLogsLogGroupArn(scope, logGroupName)}:log-stream:${logStreamName}`;
}

/**
 * The account, region and group name a log group ARN carries, or undefined
 * for a string that is not one.
 *
 * Both forms are read. `DescribeLogGroups` reports `logGroupArn` without a
 * trailing wildcard, while the `arn` field and CDK's `logGroup.logGroupArn`
 * both end in `:*`, and a template naming either means the same group. A log
 * group name cannot contain a colon, so what follows `log-group:` is the name
 * up to an optional trailing `:*`.
 */
export function simLogsParsedLogGroupArn(arn: string):
  | {
      readonly accountId: string;
      readonly regionName: string;
      readonly logGroupName: string;
    }
  | undefined {
  const [, partition, service, regionName, accountId, resourceType, ...rest] =
    arn.split(":");

  if (
    partition === undefined ||
    service !== "logs" ||
    regionName === undefined ||
    accountId === undefined ||
    resourceType !== "log-group"
  ) {
    return undefined;
  }

  const [logGroupName, wildcard, ...extra] = rest;

  if (
    logGroupName === undefined ||
    logGroupName.length === 0 ||
    extra.length > 0 ||
    (wildcard !== undefined && wildcard !== "*")
  ) {
    return undefined;
  }

  return { accountId, regionName, logGroupName };
}
