import {
  SimCloudWatchInvalidParameterValueException,
  SimCloudWatchMissingRequiredParameterException,
} from "../error/sim-cloudwatch.error.js";
import type { SimCloudWatchDatapoint } from "./sim-cloudwatch-datapoint.js";

/**
 * The shortest period real CloudWatch offers a standard-resolution metric.
 */
export const simCloudWatchMinimumPeriodSeconds = 60;

const millisecondsPerSecond = 1000;

/**
 * Read a period, refusing one real CloudWatch would refuse.
 *
 * Anything shorter than a minute, or not a whole number of minutes, belongs to
 * high-resolution metrics, which this simulation does not store.
 */
export function requiredSimCloudWatchPeriod(period?: number): number {
  if (period === undefined) {
    throw new SimCloudWatchMissingRequiredParameterException(
      "The parameter Period must be present.",
    );
  }

  if (
    !Number.isSafeInteger(period) ||
    period < simCloudWatchMinimumPeriodSeconds ||
    period % simCloudWatchMinimumPeriodSeconds !== 0
  ) {
    throw new SimCloudWatchInvalidParameterValueException(
      `The parameter Period must be a multiple of ` +
        `${simCloudWatchMinimumPeriodSeconds} seconds and at least ` +
        `${simCloudWatchMinimumPeriodSeconds}. High-resolution metrics are ` +
        `not simulated.`,
    );
  }

  return period;
}

/**
 * The instant the period holding a timestamp begins.
 *
 * Periods are measured from the epoch rather than from the request's start
 * time, so the same observation lands in the same bucket whatever window is
 * asked for. That is what real CloudWatch does for every period that divides an
 * hour, which is every period a test is likely to ask for.
 */
export function simCloudWatchPeriodStart(
  timestamp: number,
  periodSeconds: number,
): number {
  const periodMilliseconds = periodSeconds * millisecondsPerSecond;

  return Math.floor(timestamp / periodMilliseconds) * periodMilliseconds;
}

/**
 * Group datapoints by the period each of them falls in, earliest first.
 */
export function bucketSimCloudWatchDatapoints(
  datapoints: readonly SimCloudWatchDatapoint[],
  periodSeconds: number,
): ReadonlyMap<number, readonly SimCloudWatchDatapoint[]> {
  const buckets = new Map<number, SimCloudWatchDatapoint[]>();

  for (const datapoint of datapoints) {
    const start = simCloudWatchPeriodStart(datapoint.timestamp, periodSeconds);
    const bucket = buckets.get(start);

    if (bucket === undefined) {
      buckets.set(start, [datapoint]);
    } else {
      bucket.push(datapoint);
    }
  }

  return new Map(
    buckets
      .entries()
      .toArray()
      .toSorted(([left], [right]) => left - right),
  );
}
