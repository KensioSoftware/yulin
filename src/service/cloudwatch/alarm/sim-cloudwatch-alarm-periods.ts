import type { SimCloudWatchMetricStore } from "../metric/sim-cloudwatch-metric-store.js";
import { simCloudWatchPeriodAggregates } from "../metric/sim-cloudwatch-period.js";
import { simCloudWatchStatisticValue } from "../metric/sim-cloudwatch-statistic.js";
import type { SimCloudWatchAlarmDefinition } from "./sim-cloudwatch-alarm-definition.js";

const millisecondsPerSecond = 1000;

/**
 * The instant the period after the one holding an instant begins.
 *
 * An alarm evaluates on period boundaries, so this is when it next has a
 * complete period to look at.
 */
export function simCloudWatchNextPeriodBoundary(
  now: Date,
  periodSeconds: number,
): Date {
  const periodMilliseconds = periodSeconds * millisecondsPerSecond;
  const elapsed = Math.floor(now.getTime() / periodMilliseconds);

  return new Date((elapsed + 1) * periodMilliseconds);
}

/**
 * Read the periods an alarm looks at when it evaluates at an instant, oldest
 * first.
 *
 * The window is the `evaluationPeriods` complete periods before the boundary,
 * so an alarm evaluating at 09:03 with three one-minute periods reads 09:00,
 * 09:01 and 09:02 and not the minute it is standing on, which has not finished.
 *
 * A period nothing was published into comes back as `undefined` rather than
 * being left out, because which period is missing is what `TreatMissingData`
 * decides on.
 */
export function simCloudWatchAlarmPeriods(
  metrics: SimCloudWatchMetricStore,
  definition: SimCloudWatchAlarmDefinition,
  boundary: Date,
): readonly (number | undefined)[] {
  const periodMilliseconds = definition.period * millisecondsPerSecond;
  const endTime = boundary.getTime();
  const startTime = endTime - definition.evaluationPeriods * periodMilliseconds;
  const found = metrics.find(definition.metric);
  const aggregates = simCloudWatchPeriodAggregates(
    found?.within({ startTime, endTime, unit: definition.unit }) ?? [],
    definition.period,
  );

  return Array.from({ length: definition.evaluationPeriods }, (_, index) =>
    aggregates.get(startTime + index * periodMilliseconds),
  ).map((aggregate) =>
    aggregate === undefined
      ? undefined
      : simCloudWatchStatisticValue(aggregate, definition.statistic),
  );
}
