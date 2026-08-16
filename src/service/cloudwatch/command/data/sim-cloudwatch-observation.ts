import {
  SimCloudWatchInvalidParameterCombinationException,
  SimCloudWatchInvalidParameterValueException,
  SimCloudWatchMissingRequiredParameterException,
} from "../../error/sim-cloudwatch.error.js";
import type { SimCloudWatchDatapoint } from "../../metric/sim-cloudwatch-datapoint.js";
import type { SimCloudWatchStatisticSetInput } from "./data.command.js";

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
  const measured = finiteNumber("Value", value);

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
    sampleCount: finiteNumber(
      "StatisticValues.SampleCount",
      statistics?.SampleCount,
    ),
    sum: finiteNumber("StatisticValues.Sum", statistics?.Sum),
    minimum: finiteNumber("StatisticValues.Minimum", statistics?.Minimum),
    maximum: finiteNumber("StatisticValues.Maximum", statistics?.Maximum),
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

/**
 * Read a datum stating measurements and how often each of them was seen.
 *
 * They collapse into one observation, because nothing this simulation reports
 * could tell the individual measurements apart afterwards.
 */
export function readSimCloudWatchValues(
  values: readonly number[] | undefined,
  counts: readonly number[] | undefined,
): SimCloudWatchObservation {
  const measured = values ?? [];

  if (measured.length === 0) {
    throw new SimCloudWatchInvalidParameterValueException(
      "The parameter Values must not be empty.",
    );
  }

  if (counts !== undefined && counts.length !== measured.length) {
    throw new SimCloudWatchInvalidParameterCombinationException(
      "The parameters Values and Counts must have the same number of entries.",
    );
  }

  return measured.entries().reduce<SimCloudWatchObservation>(
    (observation, [index, value]) => {
      const measure = finiteNumber("Values", value);
      const count = positiveNumber("Counts", counts?.at(index) ?? 1);

      return {
        sampleCount: observation.sampleCount + count,
        sum: observation.sum + measure * count,
        minimum: Math.min(observation.minimum, measure),
        maximum: Math.max(observation.maximum, measure),
      };
    },
    { sampleCount: 0, sum: 0, minimum: Infinity, maximum: -Infinity },
  );
}

function finiteNumber(field: string, value: number | undefined): number {
  if (value === undefined) {
    throw new SimCloudWatchMissingRequiredParameterException(
      `The parameter ${field} must be present.`,
    );
  }

  if (!Number.isFinite(value)) {
    throw new SimCloudWatchInvalidParameterValueException(
      `The parameter ${field} must be a finite number.`,
    );
  }

  return value;
}

function positiveNumber(field: string, value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new SimCloudWatchInvalidParameterValueException(
      `The parameter ${field} must be a finite number greater than zero.`,
    );
  }

  return value;
}
