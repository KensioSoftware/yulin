import {
  SimCloudWatchInvalidParameterValueException,
  SimCloudWatchMissingRequiredParameterException,
} from "../../error/sim-cloudwatch.error.js";

/**
 * How many of the evaluated periods must breach for an alarm to fire.
 *
 * Left out, it is every one of them, which is what makes an alarm with three
 * evaluation periods and no M-of-N fire only when all three breach.
 */
export function simCloudWatchDatapointsToAlarm(
  datapointsToAlarm: number | undefined,
  evaluationPeriods: number,
): number {
  if (datapointsToAlarm === undefined) {
    return evaluationPeriods;
  }

  const wanted = requiredSimCloudWatchWholeNumber(
    "DatapointsToAlarm",
    datapointsToAlarm,
  );

  if (wanted > evaluationPeriods) {
    throw new SimCloudWatchInvalidParameterValueException(
      "The parameter DatapointsToAlarm must not be greater than " +
        "EvaluationPeriods.",
    );
  }

  return wanted;
}

/**
 * Read the number an alarm compares its metric against.
 */
export function requiredSimCloudWatchThreshold(
  threshold: number | undefined,
): number {
  if (threshold === undefined) {
    throw new SimCloudWatchMissingRequiredParameterException(
      "The parameter Threshold must be present.",
    );
  }

  if (!Number.isFinite(threshold)) {
    throw new SimCloudWatchInvalidParameterValueException(
      "The parameter Threshold must be a finite number.",
    );
  }

  return threshold;
}

/**
 * Read a count of periods, which is a whole number of one or more.
 */
export function requiredSimCloudWatchWholeNumber(
  field: string,
  value: number | undefined,
): number {
  if (value === undefined) {
    throw new SimCloudWatchMissingRequiredParameterException(
      `The parameter ${field} must be present.`,
    );
  }

  if (!Number.isSafeInteger(value) || value < 1) {
    throw new SimCloudWatchInvalidParameterValueException(
      `The parameter ${field} must be a whole number of one or more.`,
    );
  }

  return value;
}

/**
 * Read a value the caller had to supply.
 */
export function requiredSimCloudWatchValue(
  field: string,
  value: string | undefined,
): string {
  if (value === undefined) {
    throw new SimCloudWatchMissingRequiredParameterException(
      `The parameter ${field} must be present.`,
    );
  }

  return value;
}
