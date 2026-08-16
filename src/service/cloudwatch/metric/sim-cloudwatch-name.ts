import {
  SimCloudWatchInvalidParameterValueException,
  SimCloudWatchMissingRequiredParameterException,
} from "../error/sim-cloudwatch.error.js";

/**
 * How long a namespace, metric name, dimension name or dimension value may be.
 */
export const simCloudWatchMaximumNameLength = 255;

/**
 * Anything outside printable ASCII, which is what real CloudWatch refuses in a
 * namespace, a metric name or either half of a dimension: ASCII characters
 * only, and control characters not supported.
 *
 * Written as the printable range rather than as the control characters
 * themselves so the pattern carries no control character of its own.
 */
const outsidePrintableAscii = /[^ -~]/;

/**
 * Read a name real CloudWatch would accept, refusing one it would not.
 *
 * Namespaces, metric names and both halves of a dimension share one rule on
 * real CloudWatch, so they share one reader here and differ only in the field
 * named in the failure. The rule is deliberately wide: anything printable and
 * not entirely whitespace. A tighter whitelist would refuse names an account
 * accepts, which is the worse way for a simulator to be wrong.
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

  if (outsidePrintableAscii.test(value)) {
    throw new SimCloudWatchInvalidParameterValueException(
      `The parameter ${field} must hold only ASCII characters, and control ` +
        `characters are not supported.`,
    );
  }

  if (value.trim().length === 0) {
    throw new SimCloudWatchInvalidParameterValueException(
      `The parameter ${field} must include at least one non-whitespace ` +
        `character.`,
    );
  }

  return value;
}

/**
 * Refuse a name that begins with a colon.
 *
 * Real CloudWatch applies this to a namespace and to a dimension name, and not
 * to a dimension value.
 */
export function refuseSimCloudWatchLeadingColon(
  field: string,
  value: string,
): string {
  if (value.startsWith(":")) {
    throw new SimCloudWatchInvalidParameterValueException(
      `The parameter ${field} must not start with a colon.`,
    );
  }

  return value;
}
