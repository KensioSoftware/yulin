import { SimCloudWatchInvalidParameterValueException } from "../../error/sim-cloudwatch.error.js";
import type { SimCloudWatchDatapoint } from "../../metric/sim-cloudwatch-datapoint.js";
import type { SimCloudWatchStatisticSetInput } from "./data.command.js";
import { requiredSimCloudWatchMetricValue } from "./sim-cloudwatch-metric-value.js";

/**
 * What a metric datum measures, before it is placed in time.
 */
export type SimCloudWatchObservation = Omit<
  SimCloudWatchDatapoint,
  "timestamp" | "unit"
>;

/**
 * Read a datum stating one measurement.
 */
export function readSimCloudWatchValue(
  value: number | undefined,
): SimCloudWatchObservation {
  const measured = requiredSimCloudWatchMetricValue("Value", value);

  return {
    sampleCount: 1,
    sum: measured,
    minimum: measured,
    maximum: measured,
  };
}

/**
 * Read a datum summarising measurements it does not carry.
 */
export function readSimCloudWatchStatisticValues(
  statistics: SimCloudWatchStatisticSetInput | undefined,
): SimCloudWatchObservation {
  const observation = {
    sampleCount: requiredSimCloudWatchMetricValue(
      "StatisticValues.SampleCount",
      statistics?.SampleCount,
    ),
    sum: requiredSimCloudWatchMetricValue(
      "StatisticValues.Sum",
      statistics?.Sum,
    ),
    minimum: requiredSimCloudWatchMetricValue(
      "StatisticValues.Minimum",
      statistics?.Minimum,
    ),
    maximum: requiredSimCloudWatchMetricValue(
      "StatisticValues.Maximum",
      statistics?.Maximum,
    ),
  };

  if (observation.sampleCount <= 0) {
    throw new SimCloudWatchInvalidParameterValueException(
      "The parameter StatisticValues.SampleCount must be greater than zero.",
    );
  }

  if (observation.minimum > observation.maximum) {
    throw new SimCloudWatchInvalidParameterValueException(
      "The parameter StatisticValues.Minimum must not be greater than " +
        "StatisticValues.Maximum.",
    );
  }

  return observation;
}
