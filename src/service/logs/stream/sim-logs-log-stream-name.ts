import { SimLogsInvalidParameterException } from "../error/sim-logs.error.js";

const maximumLength = 512;

/**
 * The two characters real CloudWatch Logs refuses in a log stream name.
 *
 * The colon is what separates the stream from the group in an ARN, and the
 * asterisk is what a policy matches with, so a name carrying either would be
 * a name that could not be addressed.
 */
const forbiddenCharacters = [":", "*"];

/**
 * Read a log stream name, refusing one real CloudWatch Logs would refuse.
 */
export function requiredSimLogsLogStreamName(logStreamName?: string): string {
  if (logStreamName === undefined || logStreamName.length === 0) {
    throw new SimLogsInvalidParameterException(
      "1 validation error detected: Value at 'logStreamName' failed to " +
        "satisfy constraint: Member must not be null",
    );
  }

  if (logStreamName.length > maximumLength) {
    throw new SimLogsInvalidParameterException(
      `1 validation error detected: Value at 'logStreamName' failed to ` +
        `satisfy constraint: Member must have length less than or equal to ` +
        `${maximumLength}`,
    );
  }

  if (forbiddenCharacters.some((character) => logStreamName.includes(character))) {
    throw new SimLogsInvalidParameterException(
      "1 validation error detected: Value at 'logStreamName' failed to " +
        "satisfy constraint: Member must not contain ':' or '*'",
    );
  }

  return logStreamName;
}
