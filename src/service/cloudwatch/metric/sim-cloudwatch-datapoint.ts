/**
 * One observation of a metric, held the way every statistic is read from.
 *
 * A single `Value: 3` and a `StatisticValues` block describing a thousand
 * requests are the same shape here, because that shape is what CloudWatch can
 * answer every statistic from: a count, a total, and the two extremes. Storing
 * individual values instead would answer no more questions and would make a
 * `StatisticValues` datum impossible to store at all, since it never carries
 * the values it summarises.
 */
export interface SimCloudWatchDatapoint {
  /** When the observation was made, in milliseconds since the epoch. */
  readonly timestamp: number;

  readonly sampleCount: number;
  readonly sum: number;
  readonly minimum: number;
  readonly maximum: number;

  /** The unit given with the observation, if it carried one. */
  readonly unit: string | undefined;
}

/**
 * The statistics a set of datapoints answers with.
 */
export interface SimCloudWatchAggregate {
  readonly sampleCount: number;
  readonly sum: number;
  readonly minimum: number;
  readonly maximum: number;
  readonly average: number;
  readonly unit: string | undefined;
}

/**
 * Combine datapoints into the statistics CloudWatch reports for them.
 *
 * An empty set has no statistics rather than zeroed ones: real CloudWatch
 * reports no datapoint at all for a period nothing was written into, which is
 * a different thing from a period whose values summed to zero.
 *
 * The unit reported is the first one seen. Real CloudWatch keeps values of
 * different units apart within a metric, and a caller wanting one of them says
 * so with the `Unit` filter before the values reach here.
 */
export function aggregateSimCloudWatchDatapoints(
  datapoints: readonly SimCloudWatchDatapoint[],
): SimCloudWatchAggregate | undefined {
  const first = datapoints.at(0);

  if (first === undefined) {
    return undefined;
  }

  let sampleCount = 0;
  let sum = 0;
  let minimum = first.minimum;
  let maximum = first.maximum;

  for (const datapoint of datapoints) {
    sampleCount += datapoint.sampleCount;
    sum += datapoint.sum;
    minimum = Math.min(minimum, datapoint.minimum);
    maximum = Math.max(maximum, datapoint.maximum);
  }

  return {
    sampleCount,
    sum,
    minimum,
    maximum,
    average: sum / sampleCount,
    unit: datapoints.find((datapoint) => datapoint.unit !== undefined)?.unit,
  };
}
