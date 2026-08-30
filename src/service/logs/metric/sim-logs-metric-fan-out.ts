import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimLogsStoredEvent } from "../event/sim-logs-event.js";
import type { SimLogsLogGroup } from "../group/sim-logs-log-group.js";
import type { SimLogsMetricDatapoint } from "./sim-logs-metric-datapoint.js";
import type { SimLogsMetricPublications } from "./sim-logs-metric-publications.js";

/**
 * One datapoint a metric filter could not publish.
 */
export interface SimLogsMetricPublicationFailure {
  readonly logGroupName: string;
  readonly filterName: string;
  readonly metricNamespace: string;
  readonly metricName: string;
  readonly reason: string;
}

interface SimLogsMetricFanOutProperties {
  readonly publications: SimLogsMetricPublications;
  readonly background: BackgroundScheduler;
}

/**
 * Turns events written to a log group into the metric datapoints its metric
 * filters ask for.
 *
 * Publication happens on the background scheduler, for the reason subscription
 * delivery does. Real CloudWatch Logs answers `PutLogEvents` whether or not
 * the metric behind a filter took the datapoint, and a metric that cannot be
 * written must not fail the write that produced it.
 * `simAws.backgroundTasksComplete()` is what waits for it.
 */
export class SimLogsMetricFanOut {
  readonly #publications: SimLogsMetricPublications;
  readonly #background: BackgroundScheduler;
  readonly #failures: SimLogsMetricPublicationFailure[] = [];

  constructor(properties: SimLogsMetricFanOutProperties) {
    this.#publications = properties.publications;
    this.#background = properties.background;
  }

  /**
   * Every publication this scope could not make.
   *
   * A failed publication is invisible in an account, where it becomes a metric
   * nobody is watching. Keeping it is what lets a test find out that the
   * metric filter it set up never wrote anything.
   */
  get failures(): readonly SimLogsMetricPublicationFailure[] {
    return this.#failures;
  }

  /**
   * Check a metric filter could publish at all, before one is put.
   *
   * Publishing nothing is the question. A CloudWatch that is there takes an
   * empty batch and does nothing with it, and a simulated CloudWatch Logs
   * built on its own refuses it, which is the answer the caller needs.
   */
  async checkPublishable(): Promise<void> {
    await this.#publications.publish([]);
  }

  /**
   * Schedule the datapoints every metric filter on the group wants from these
   * events.
   */
  written(group: SimLogsLogGroup, events: readonly SimLogsStoredEvent[]): void {
    for (const filter of group.metricFilters.all) {
      const datapoints = events.flatMap((event) =>
        filter.datapoints(event.message),
      );

      if (datapoints.length > 0) {
        this.schedule(group.logGroupName, filter.filterName, datapoints);
      }
    }
  }

  private schedule(
    logGroupName: string,
    filterName: string,
    datapoints: readonly SimLogsMetricDatapoint[],
  ): void {
    this.#background.schedule(async () => {
      try {
        await this.#publications.publish(datapoints);
      } catch (error) {
        this.recordFailure(logGroupName, filterName, datapoints, error);
      }
    });
  }

  private recordFailure(
    logGroupName: string,
    filterName: string,
    datapoints: readonly SimLogsMetricDatapoint[],
    error: unknown,
  ): void {
    const reason = error instanceof Error ? error.message : String(error);

    for (const datapoint of datapoints) {
      this.#failures.push({
        logGroupName,
        filterName,
        metricNamespace: datapoint.namespace,
        metricName: datapoint.metricName,
        reason,
      });
    }
  }
}
