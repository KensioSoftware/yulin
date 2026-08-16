import {
  SimCloudWatchInvalidParameterValueException,
  SimCloudWatchMissingRequiredParameterException,
} from "../error/sim-cloudwatch.error.js";

/**
 * The window a metric query asks about, in milliseconds since the epoch.
 *
 * The start is included and the end is not, which is how real CloudWatch reads
 * the two: a request ending on the minute does not pick up that minute's
 * datapoint.
 */
export interface SimCloudWatchTimeRange {
  readonly startTime: number;
  readonly endTime: number;
}

/**
 * Read the window a query asks about, refusing one real CloudWatch would.
 */
export function requiredSimCloudWatchTimeRange(
  startTime?: Date,
  endTime?: Date,
): SimCloudWatchTimeRange {
  const range = {
    startTime: requiredTime("StartTime", startTime),
    endTime: requiredTime("EndTime", endTime),
  };

  if (range.startTime >= range.endTime) {
    throw new SimCloudWatchInvalidParameterValueException(
      "The parameter StartTime must be earlier than EndTime.",
    );
  }

  return range;
}

function requiredTime(field: string, time: Date | undefined): number {
  if (time === undefined) {
    throw new SimCloudWatchMissingRequiredParameterException(
      `The parameter ${field} must be present.`,
    );
  }

  const milliseconds = time.getTime();

  if (Number.isNaN(milliseconds)) {
    throw new SimCloudWatchInvalidParameterValueException(
      `The parameter ${field} must be a valid date.`,
    );
  }

  return milliseconds;
}
