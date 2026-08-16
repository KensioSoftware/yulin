import {
  refuseSimCloudWatchValuesShape,
  requiredSimCloudWatchCount,
  requiredSimCloudWatchMetricValue,
} from "./sim-cloudwatch-metric-value.js";
import type { SimCloudWatchObservation } from "./sim-cloudwatch-observation.js";

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

  refuseSimCloudWatchValuesShape(measured, counts);

  return measured.entries().reduce<SimCloudWatchObservation>(
    (observation, [index, value]) => {
      const measure = requiredSimCloudWatchMetricValue("Values", value);
      const count = requiredSimCloudWatchCount(
        "Counts",
        counts?.at(index) ?? 1,
      );

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
