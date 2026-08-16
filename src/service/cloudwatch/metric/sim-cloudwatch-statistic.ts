import { SimCloudWatchInvalidParameterValueException } from "../error/sim-cloudwatch.error.js";
import type { SimCloudWatchAggregate } from "./sim-cloudwatch-datapoint.js";

/**
 * The statistics real CloudWatch can answer from a stored metric.
 *
 * Percentiles are the notable absence. They need the individual values behind
 * a period, which a `StatisticValues` datum never carries, so CloudWatch itself
 * cannot report one for a metric published that way. Rather than answer for
 * some metrics and not others, this simulation answers for none and says so.
 */
export const simCloudWatchStatistics = [
  "SampleCount",
  "Average",
  "Sum",
  "Minimum",
  "Maximum",
] as const;

export type SimCloudWatchStatistic = (typeof simCloudWatchStatistics)[number];

/**
 * Read a statistic name, refusing one CloudWatch does not offer.
 */
export function requiredSimCloudWatchStatistic(
  statistic: string,
): SimCloudWatchStatistic {
  const found = simCloudWatchStatistics.find((one) => one === statistic);

  if (found === undefined) {
    throw new SimCloudWatchInvalidParameterValueException(
      `The statistic ${statistic} is not one this simulation reports. ` +
        `Percentiles and other extended statistics are not simulated; use ` +
        `one of ${simCloudWatchStatistics.join(", ")}.`,
    );
  }

  return found;
}

/**
 * Read one statistic out of a period's combined observations.
 */
export function simCloudWatchStatisticValue(
  aggregate: SimCloudWatchAggregate,
  statistic: SimCloudWatchStatistic,
): number {
  switch (statistic) {
    case "SampleCount": {
      return aggregate.sampleCount;
    }
    case "Average": {
      return aggregate.average;
    }
    case "Sum": {
      return aggregate.sum;
    }
    case "Minimum": {
      return aggregate.minimum;
    }
    case "Maximum": {
      return aggregate.maximum;
    }
  }
}
