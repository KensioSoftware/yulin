import type { SimClock } from "../../../util/clock/sim-clock.js";
import type { SimCloudWatchDimension } from "../metric/sim-cloudwatch-dimension.js";
import type { SimCloudWatchMetricStore } from "../metric/sim-cloudwatch-metric-store.js";
import type { SimCloudWatchUnit } from "../metric/sim-cloudwatch-unit.js";

/**
 * One metric a simulated service publishes about itself.
 */
export interface SimCloudWatchServiceDatum {
  readonly namespace: string;
  readonly metricName: string;
  readonly dimensions: readonly SimCloudWatchDimension[];
  readonly value: number;
  readonly unit?: SimCloudWatchUnit | undefined;

  /**
   * When the observation was made. The simulation's clock stamps one that
   * arrives without it.
   */
  readonly timestamp?: number | undefined;
}

interface SimCloudWatchServiceWriterProperties {
  readonly metrics: SimCloudWatchMetricStore;
  readonly clock: SimClock;
}

/**
 * How the rest of the simulation publishes the metrics AWS publishes.
 *
 * This is not the CloudWatch API. A simulated service counting its own work is
 * the account's own machinery rather than a caller making a request, so
 * nothing here validates a request or authorizes one. Real CloudWatch does not
 * put Lambda's own `Invocations` through `PutMetricData` either.
 *
 * The reserved namespace rule is the point of the separation. `PutMetricData`
 * refuses a namespace beginning `AWS/`, exactly as an account does, and the
 * services whose metrics those are reach the store through here instead.
 */
export class SimCloudWatchServiceWriter {
  readonly #metrics: SimCloudWatchMetricStore;
  readonly #clock: SimClock;

  constructor(properties: SimCloudWatchServiceWriterProperties) {
    this.#metrics = properties.metrics;
    this.#clock = properties.clock;
  }

  /**
   * Record one observation of each metric given.
   *
   * A whole batch goes in together so one invocation's metrics land at the
   * same instant, whatever the clock does next.
   */
  publish(data: readonly SimCloudWatchServiceDatum[]): void {
    const now = this.#clock.now().getTime();

    for (const datum of data) {
      this.#metrics
        .ensure({
          namespace: datum.namespace,
          metricName: datum.metricName,
          dimensions: datum.dimensions,
        })
        .record({
          timestamp: datum.timestamp ?? now,
          sampleCount: 1,
          sum: datum.value,
          minimum: datum.value,
          maximum: datum.value,
          unit: datum.unit,
        });
    }
  }
}
