import {
  SimCloudWatchInvalidParameterCombinationException,
  SimCloudWatchInvalidParameterValueException,
  SimCloudWatchMissingRequiredParameterException,
} from "../../error/sim-cloudwatch.error.js";
import type { SimCloudWatchDatapoint } from "../../metric/sim-cloudwatch-datapoint.js";
import type { SimCloudWatchMetricDatumInput } from "./data.command.js";
import {
  readSimCloudWatchStatisticValues,
  readSimCloudWatchValue,
  readSimCloudWatchValues,
  type SimCloudWatchObservation,
} from "./sim-cloudwatch-observation.js";

/**
 * The storage resolution of a standard metric, in seconds. The other value
 * real CloudWatch accepts, one second, makes a high-resolution metric.
 */
const standardStorageResolution = 60;

/**
 * Read the observation one metric datum carries.
 *
 * A datum states its values in one of three ways and every one of them reduces
 * to the same count, total and extremes, so they are read into one shape here
 * and the rest of the service never has to know which form was used.
 */
export function readSimCloudWatchDatapoint(
  datum: SimCloudWatchMetricDatumInput,
  defaultTimestamp: Date,
): SimCloudWatchDatapoint {
  refuseHighResolution(datum.StorageResolution);

  return {
    ...readObservation(datum),
    timestamp: (datum.Timestamp ?? defaultTimestamp).getTime(),
    unit: datum.Unit,
  };
}

/**
 * Read whichever of the three forms the datum used, refusing a datum using
 * none of them or more than one.
 */
function readObservation(
  datum: SimCloudWatchMetricDatumInput,
): SimCloudWatchObservation {
  const forms = [
    datum.Value === undefined
      ? undefined
      : (): SimCloudWatchObservation => readSimCloudWatchValue(datum.Value),
    datum.StatisticValues === undefined
      ? undefined
      : (): SimCloudWatchObservation =>
          readSimCloudWatchStatisticValues(datum.StatisticValues),
    datum.Values === undefined
      ? undefined
      : (): SimCloudWatchObservation =>
          readSimCloudWatchValues(datum.Values, datum.Counts),
  ].filter((form) => form !== undefined);

  const only = forms.at(0);

  if (only === undefined) {
    throw new SimCloudWatchMissingRequiredParameterException(
      "Each metric datum must carry Value, StatisticValues or Values.",
    );
  }

  if (forms.length > 1) {
    throw new SimCloudWatchInvalidParameterCombinationException(
      "A metric datum must carry only one of Value, StatisticValues and " +
        "Values.",
    );
  }

  return only();
}

function refuseHighResolution(storageResolution: number | undefined): void {
  if (
    storageResolution !== undefined &&
    storageResolution !== standardStorageResolution
  ) {
    throw new SimCloudWatchInvalidParameterValueException(
      `StorageResolution ${storageResolution} is not simulated: only ` +
        `standard ${standardStorageResolution} second resolution is, so a ` +
        `high-resolution metric would be stored and queried here at a ` +
        `resolution it does not have on real AWS.`,
    );
  }
}
