import {
  SimCloudWatchInvalidParameterValueException,
  SimCloudWatchMissingRequiredParameterException,
} from "../error/sim-cloudwatch.error.js";

/**
 * How long a namespace, metric name, dimension name or dimension value may be.
 */
export const simCloudWatchMaximumNameLength = 255;

/**
 * The characters real CloudWatch accepts in a namespace, metric name or
 * dimension: alphanumerics, period, hyphen, underscore, forward slash, hash,
 * colon and the space character.
 */
const namePattern = /^[A-Za-z0-9._/#: -]+$/;

/** How this reads back when a name is refused for its characters. */
const reportedNamePattern = "[A-Za-z0-9._/#: -]+";

/**
 * Read a name real CloudWatch would accept, refusing one it would not.
 *
 * Namespaces, metric names and both halves of a dimension share one character
 * set and one length limit on real CloudWatch, so they share one reader here
 * and differ only in the field named in the failure.
 */
export function requiredSimCloudWatchName(
  field: string,
  value?: string,
): string {
  if (value === undefined || value.length === 0) {
    throw new SimCloudWatchMissingRequiredParameterException(
      `The parameter ${field} must be present and not empty.`,
    );
  }

  if (value.length > simCloudWatchMaximumNameLength) {
    throw new SimCloudWatchInvalidParameterValueException(
      `The parameter ${field} must have length less than or equal to ` +
        `${simCloudWatchMaximumNameLength}.`,
    );
  }

  if (!namePattern.test(value)) {
    throw new SimCloudWatchInvalidParameterValueException(
      `The parameter ${field} must satisfy the pattern ${reportedNamePattern}.`,
    );
  }

  return value;
}
