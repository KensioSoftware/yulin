import {
  SimCloudWatchInvalidParameterCombinationException,
  SimCloudWatchInvalidParameterValueException,
  SimCloudWatchMissingRequiredParameterException,
} from "../../error/sim-cloudwatch.error.js";

/**
 * The largest magnitude real CloudWatch stores. Values outside it are refused,
 * as are NaN and the infinities.
 *
 * Enforcing it at the edge is what keeps a stored total finite: the widest
 * batch this simulation accepts is a thousand data of a hundred and fifty
 * values each, so nothing summed from values inside this range can reach the
 * top of a double, and no aggregate downstream has to defend against one.
 */
const maximumMagnitude = 2 ** 360;

/**
 * Read a number a metric may be measured in.
 */
export function requiredSimCloudWatchMetricValue(
  field: string,
  value: number | undefined,
): number {
  if (value === undefined) {
    throw new SimCloudWatchMissingRequiredParameterException(
      `The parameter ${field} must be present.`,
    );
  }

  if (!Number.isFinite(value)) {
    throw new SimCloudWatchInvalidParameterValueException(
      `The parameter ${field} must be a number, and NaN and the infinities ` +
        `are not supported.`,
    );
  }

  if (Math.abs(value) > maximumMagnitude) {
    throw new SimCloudWatchInvalidParameterValueException(
      `The parameter ${field} must be within the range CloudWatch stores, ` +
        `which is -2^360 to 2^360.`,
    );
  }

  return value;
}

/**
 * Read a number of times a value was observed, which cannot be none.
 */
export function requiredSimCloudWatchCount(
  field: string,
  value: number,
): number {
  if (requiredSimCloudWatchMetricValue(field, value) <= 0) {
    throw new SimCloudWatchInvalidParameterValueException(
      `The parameter ${field} must be greater than zero.`,
    );
  }

  return value;
}

/**
 * How many unique values one datum may list beside its counts.
 */
const maximumValues = 150;

/**
 * Refuse a Values array, and the Counts beside it, that real CloudWatch would
 * refuse.
 */
export function refuseSimCloudWatchValuesShape(
  values: readonly number[],
  counts: readonly number[] | undefined,
): void {
  if (values.length === 0) {
    throw new SimCloudWatchInvalidParameterValueException(
      "The parameter Values must not be empty.",
    );
  }

  if (values.length > maximumValues) {
    throw new SimCloudWatchInvalidParameterValueException(
      `The parameter Values may list at most ${maximumValues} unique values, ` +
        `and ${values.length} were given.`,
    );
  }

  if (counts !== undefined && counts.length !== values.length) {
    throw new SimCloudWatchInvalidParameterCombinationException(
      "The parameters Values and Counts must have the same number of entries.",
    );
  }
}
