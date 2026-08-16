import { SimCloudWatchInvalidParameterCombinationException } from "../../error/sim-cloudwatch.error.js";
import type {
  SimCloudWatchAggregate,
  SimCloudWatchDatapoint,
} from "../../metric/sim-cloudwatch-datapoint.js";
import { simCloudWatchPeriodAggregates } from "../../metric/sim-cloudwatch-period.js";
import {
  type SimCloudWatchStatistic,
  simCloudWatchStatisticValue,
} from "../../metric/sim-cloudwatch-statistic.js";
import type { SimCloudWatchDatapointDetail } from "./query.command.js";

/**
 * How many datapoints real CloudWatch returns from one GetMetricStatistics.
 */
const maximumDatapoints = 1440;

const millisecondsPerSecond = 1000;

/**
 * Report one datapoint per period holding observations, earliest first.
 *
 * Real CloudWatch returns datapoints in no particular order. Ordering them
 * here is something that contract allows, and something a test reading the
 * third period of five needs.
 */
export function simCloudWatchStatisticDatapoints(
  datapoints: readonly SimCloudWatchDatapoint[],
  period: number,
  statistics: readonly SimCloudWatchStatistic[],
): readonly SimCloudWatchDatapointDetail[] {
  return simCloudWatchPeriodAggregates(datapoints, period)
    .entries()
    .map(([start, aggregate]) => detail(start, aggregate, statistics))
    .toArray();
}

/**
 * Refuse a window and period that between them cover more periods than one
 * response can report.
 */
export function refuseTooManySimCloudWatchPeriods(
  milliseconds: number,
  period: number,
): void {
  const periods = milliseconds / (period * millisecondsPerSecond);

  if (periods > maximumDatapoints) {
    throw new SimCloudWatchInvalidParameterCombinationException(
      `The requested time range covers ${Math.ceil(periods)} periods of ` +
        `${period} seconds, and at most ${maximumDatapoints} datapoints can ` +
        `be returned. Ask for a shorter range or a longer period.`,
    );
  }
}

/**
 * What one period reports, which is only the statistics that were asked for: a
 * request for `Sum` alone gets no `Average` beside it, as on real CloudWatch.
 */
function detail(
  start: number,
  aggregate: SimCloudWatchAggregate,
  statistics: readonly SimCloudWatchStatistic[],
): SimCloudWatchDatapointDetail {
  const reported: Partial<Record<SimCloudWatchStatistic, number>> =
    Object.fromEntries(
      statistics.map((statistic) => [
        statistic,
        simCloudWatchStatisticValue(aggregate, statistic),
      ]),
    );

  return { Timestamp: new Date(start), Unit: aggregate.unit, ...reported };
}
