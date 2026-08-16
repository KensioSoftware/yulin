import type { SimCloudWatchDimension } from "./sim-cloudwatch-dimension.js";
import { simCloudWatchDimensionsKey } from "./sim-cloudwatch-dimension.js";
import {
  SimCloudWatchMetric,
  type SimCloudWatchMetricIdentity,
} from "./sim-cloudwatch-metric.js";

/**
 * Which metrics a listing is asking for.
 *
 * A dimension filter carrying no value matches any value under that name,
 * which is the one place CloudWatch does look at dimensions one at a time. It
 * selects which metrics to report, never how their values are combined.
 */
export interface SimCloudWatchMetricFilter {
  readonly namespace?: string | undefined;
  readonly metricName?: string | undefined;
  readonly dimensions?: readonly SimCloudWatchDimensionFilter[] | undefined;
}

export interface SimCloudWatchDimensionFilter {
  readonly name: string;
  readonly value?: string | undefined;
}

/**
 * The metrics of one simulated CloudWatch scope.
 *
 * Metrics are keyed by namespace, name and dimension set together, because
 * that triple is the whole of a metric's identity on real CloudWatch: writing
 * the same metric name under a different dimension set makes a second metric
 * rather than adding to the first.
 */
export class SimCloudWatchMetricStore {
  readonly #metrics = new Map<string, SimCloudWatchMetric>();

  /**
   * Every metric in this scope, in the order each was first written to.
   */
  get all(): readonly SimCloudWatchMetric[] {
    return this.#metrics.values().toArray();
  }

  /**
   * Find a metric by its full identity.
   */
  find(identity: SimCloudWatchMetricIdentity): SimCloudWatchMetric | undefined {
    return this.#metrics.get(metricKey(identity));
  }

  /**
   * Get a metric by its full identity, making it if this is its first
   * observation.
   */
  ensure(identity: SimCloudWatchMetricIdentity): SimCloudWatchMetric {
    const key = metricKey(identity);
    const found = this.#metrics.get(key);

    if (found !== undefined) {
      return found;
    }

    const metric = new SimCloudWatchMetric(identity);

    this.#metrics.set(key, metric);

    return metric;
  }

  /**
   * The metrics a filter selects, in the order each was first written to.
   */
  matching(filter: SimCloudWatchMetricFilter): readonly SimCloudWatchMetric[] {
    return this.all.filter(
      (metric) =>
        (filter.namespace === undefined ||
          metric.namespace === filter.namespace) &&
        (filter.metricName === undefined ||
          metric.metricName === filter.metricName) &&
        (filter.dimensions ?? []).every((wanted) =>
          matchesDimension(metric.dimensions, wanted),
        ),
    );
  }
}

function matchesDimension(
  dimensions: readonly SimCloudWatchDimension[],
  wanted: SimCloudWatchDimensionFilter,
): boolean {
  return dimensions.some(
    (dimension) =>
      dimension.name === wanted.name &&
      (wanted.value === undefined || dimension.value === wanted.value),
  );
}

function metricKey(identity: SimCloudWatchMetricIdentity): string {
  return JSON.stringify([
    identity.namespace,
    identity.metricName,
    simCloudWatchDimensionsKey(identity.dimensions),
  ]);
}
