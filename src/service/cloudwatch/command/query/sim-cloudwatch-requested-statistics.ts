import {
  SimCloudWatchInvalidParameterValueException,
  SimCloudWatchMissingRequiredParameterException,
} from "../../error/sim-cloudwatch.error.js";
import {
  requiredSimCloudWatchStatistic,
  type SimCloudWatchStatistic,
} from "../../metric/sim-cloudwatch-statistic.js";

/**
 * Read the statistics a GetMetricStatistics request asked for.
 *
 * Extended statistics are refused rather than dropped. They are the percentiles
 * and trimmed means, and answering a request for `p99` with the plain values
 * beside it would let a test assert on a number that is not the one it named.
 */
export function requiredSimCloudWatchStatistics(
  statistics: readonly string[] | undefined,
  extendedStatistics: readonly string[] | undefined,
): readonly SimCloudWatchStatistic[] {
  if (extendedStatistics !== undefined && extendedStatistics.length > 0) {
    throw new SimCloudWatchInvalidParameterValueException(
      "ExtendedStatistics is not simulated: percentiles need the individual " +
        "values behind a period, which a StatisticValues datum never carries.",
    );
  }

  if (statistics === undefined || statistics.length === 0) {
    throw new SimCloudWatchMissingRequiredParameterException(
      "The parameter Statistics must be present and not empty.",
    );
  }

  return statistics.map((statistic) =>
    requiredSimCloudWatchStatistic(statistic),
  );
}
