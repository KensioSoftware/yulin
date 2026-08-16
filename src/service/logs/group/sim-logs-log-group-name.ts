import { SimLogsInvalidParameterException } from "../error/sim-logs.error.js";

const maximumLength = 512;

/**
 * What real CloudWatch Logs accepts in a log group name: letters, numbers,
 * underscore, hyphen, forward slash, period and number sign.
 */
const logGroupNamePattern = /^[.\-_/#A-Za-z0-9]+$/;

/** How real CloudWatch Logs writes that pattern when it refuses a name. */
const reportedNamePattern = String.raw`[\.\-_/#A-Za-z0-9]+`;

/**
 * Read a log group name, refusing one real CloudWatch Logs would refuse.
 *
 * The leading slash of a name like `/aws/lambda/orders` is part of the name and
 * is kept, unlike an SSM parameter name, whose slash is dropped on the way into
 * its ARN. A log group ARN carries the name exactly as it was given.
 */
export function requiredSimLogsLogGroupName(logGroupName?: string): string {
  if (logGroupName === undefined || logGroupName.length === 0) {
    throw new SimLogsInvalidParameterException(
      "1 validation error detected: Value at 'logGroupName' failed to " +
        "satisfy constraint: Member must not be null",
    );
  }

  if (logGroupName.length > maximumLength) {
    throw new SimLogsInvalidParameterException(
      `1 validation error detected: Value at 'logGroupName' failed to ` +
        `satisfy constraint: Member must have length less than or equal to ` +
        `${maximumLength}`,
    );
  }

  if (!logGroupNamePattern.test(logGroupName)) {
    throw new SimLogsInvalidParameterException(
      `1 validation error detected: Value at 'logGroupName' failed to ` +
        `satisfy constraint: Member must satisfy regular expression ` +
        `pattern: ${reportedNamePattern}`,
    );
  }

  return logGroupName;
}
