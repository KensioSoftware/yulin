import type { SimCloudWatchDatapoint } from "./sim-cloudwatch-datapoint.js";
import type { SimCloudWatchDimension } from "./sim-cloudwatch-dimension.js";

/**
 * What names one metric apart from every other.
 *
 * All three parts matter. Real CloudWatch treats a metric with one dimension
 * and the same metric with two as different metrics entirely, and rolls nothing
 * up between them.
 */
export interface SimCloudWatchMetricIdentity {
  readonly namespace: string;
  readonly metricName: string;
  readonly dimensions: readonly SimCloudWatchDimension[];
}

/**
 * Which observations of a metric a request is asking about.
 */
export interface SimCloudWatchDatapointWindow {
  /** The first instant included, in milliseconds since the epoch. */
  readonly startTime: number;

  /** The first instant excluded, as real CloudWatch reads an end time. */
  readonly endTime: number;

  /** Keep only observations recorded in this unit, if one is named. */
  readonly unit?: string | undefined;
}

/**
 * One metric in a simulated CloudWatch scope, and everything written to it.
 */
export class SimCloudWatchMetric {
  readonly namespace: string;
  readonly metricName: string;
  readonly dimensions: readonly SimCloudWatchDimension[];

  readonly #datapoints: SimCloudWatchDatapoint[] = [];

  constructor(identity: SimCloudWatchMetricIdentity) {
    this.namespace = identity.namespace;
    this.metricName = identity.metricName;
    this.dimensions = identity.dimensions;
  }

  /**
   * Every observation of this metric, in the order it was written.
   */
  get datapoints(): readonly SimCloudWatchDatapoint[] {
    return this.#datapoints;
  }

  /**
   * When this metric was last written to, if it ever was.
   */
  get lastWrittenAt(): number | undefined {
    return this.#datapoints.reduce<number | undefined>(
      (latest, datapoint) =>
        latest === undefined || datapoint.timestamp > latest
          ? datapoint.timestamp
          : latest,
      undefined,
    );
  }

  /**
   * Record one observation.
   */
  record(datapoint: SimCloudWatchDatapoint): void {
    this.#datapoints.push(datapoint);
  }

  /**
   * The observations falling in a window, earliest first.
   */
  within(
    window: SimCloudWatchDatapointWindow,
  ): readonly SimCloudWatchDatapoint[] {
    return this.#datapoints
      .filter(
        (datapoint) =>
          datapoint.timestamp >= window.startTime &&
          datapoint.timestamp < window.endTime &&
          (window.unit === undefined || datapoint.unit === window.unit),
      )
      .toSorted((left, right) => left.timestamp - right.timestamp);
  }
}
