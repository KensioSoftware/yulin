import type { SimCloudWatchUnit } from "./sim-cloudwatch-unit.js";

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
  readonly unit: SimCloudWatchUnit | undefined;
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
  readonly unit: SimCloudWatchUnit | undefined;
}

/**
 * One or more observations of the same metric.
 *
 * Aggregating takes this rather than a plain array because there are no
 * statistics to report for no observations at all, and real CloudWatch reports
 * no datapoint for a period nothing was written into rather than a zeroed one.
 * Saying so in the type means the empty case cannot reach here to be guarded
 * against.
 */
export type SimCloudWatchObservations = readonly [
  SimCloudWatchDatapoint,
  ...SimCloudWatchDatapoint[],
];

/**
 * Combine observations into the statistics CloudWatch reports for them.
 *
 * The unit reported is the first one seen. Real CloudWatch keeps values of
 * different units apart within a metric, and a caller wanting one of them says
 * so with the `Unit` filter before the values reach here.
 */
export function aggregateSimCloudWatchDatapoints(
  datapoints: SimCloudWatchObservations,
): SimCloudWatchAggregate {
  const [first] = datapoints;

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
