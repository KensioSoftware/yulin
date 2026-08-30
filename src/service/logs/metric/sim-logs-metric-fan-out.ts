import type { BackgroundScheduler } from "../../../util/background/background.js";
import { SimLogsUnsupportedOperationException } from "../error/sim-logs.error.js";
import type { SimLogsStoredEvent } from "../event/sim-logs-event.js";
import type { SimLogsLogGroup } from "../group/sim-logs-log-group.js";
import { simLogsEmbeddedMetricReading } from "./emf/sim-logs-embedded-metric-datapoints.js";
import type { SimLogsMetricDatapoint } from "./sim-logs-metric-datapoint.js";
import {
  metricFilterSource,
  simLogsEmbeddedMetricSource,
  type SimLogsMetricPublicationFailure,
  type SimLogsMetricPublicationSource,
} from "./sim-logs-metric-publication-failure.js";
import type { SimLogsMetricPublications } from "./sim-logs-metric-publications.js";

interface SimLogsMetricFanOutProperties {
  readonly publications: SimLogsMetricPublications | undefined;
  readonly background: BackgroundScheduler;
}

/**
 * Turns events written to a log group into metric datapoints.
 *
 * Two things ask for them. A metric filter on the group counts the events it
 * matches, and an event that is itself an Embedded Metric Format document
 * carries its own. Real CloudWatch reads both without being asked.
 *
 * Publication happens on the background scheduler, for the reason subscription
 * delivery does. Real CloudWatch Logs answers `PutLogEvents` whether or not
 * the metric took the datapoint, and a metric that cannot be written must not
 * fail the write that produced it. `simAws.backgroundTasksComplete()` is what
 * waits for it.
 */
export class SimLogsMetricFanOut {
  readonly #publications: SimLogsMetricPublications | undefined;
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
   * metrics it set up never wrote anything.
   */
  get failures(): readonly SimLogsMetricPublicationFailure[] {
    return this.#failures;
  }

  /**
   * Check a metric filter could publish at all, before one is put.
   *
   * A simulated CloudWatch Logs built on its own has no CloudWatch to write
   * into, and a filter that accepts its configuration and publishes nothing is
   * the hardest kind of thing to find.
   */
  checkPublishable(): void {
    if (this.#publications === undefined) {
      throw new SimLogsUnsupportedOperationException(
        "This simulated CloudWatch Logs has no simulated CloudWatch to " +
          "publish a metric filter's datapoints into. Reach CloudWatch Logs " +
          "through a SimAws Account Region scope for a metric filter to " +
          "publish.",
      );
    }
  }

  /**
   * Schedule the datapoints a batch of events produced.
   *
   * A whole batch goes to each metric filter at once, because a filter
   * aggregates its default value over a period rather than over one event. An
   * embedded document is read one event at a time, because each carries its
   * own metrics and its own timestamp.
   *
   * A CloudWatch Logs with nowhere to publish reads nothing. It can hold no
   * metric filter, and a Powertools log line written to one is an ordinary log
   * line rather than a failure worth recording.
   */
  written(group: SimLogsLogGroup, events: readonly SimLogsStoredEvent[]): void {
    if (this.#publications === undefined) {
      return;
    }

    for (const filter of group.metricFilters.all) {
      const datapoints = filter.datapoints(events);

      if (datapoints.length > 0) {
        this.schedule(
          group.logGroupName,
          metricFilterSource(filter.filterName),
          datapoints,
        );
      }
    }

    this.writtenEmbedded(group.logGroupName, events);
  }

  /**
   * Schedule the datapoints the events carried as EMF documents.
   */
  private writtenEmbedded(
    logGroupName: string,
    events: readonly SimLogsStoredEvent[],
  ): void {
    const datapoints: SimLogsMetricDatapoint[] = [];

    for (const event of events) {
      const reading = simLogsEmbeddedMetricReading(
        event.message,
        event.ingestionTime,
      );

      datapoints.push(...reading.datapoints);

      for (const skip of reading.skipped) {
        this.#failures.push({
          logGroupName,
          source: simLogsEmbeddedMetricSource,
          ...skip,
        });
      }
    }

    if (datapoints.length > 0) {
      this.schedule(logGroupName, simLogsEmbeddedMetricSource, datapoints);
    }
  }

  private schedule(
    logGroupName: string,
    source: SimLogsMetricPublicationSource,
    datapoints: readonly SimLogsMetricDatapoint[],
  ): void {
    this.#background.schedule(async () => {
      try {
        await this.#publications?.publish(datapoints);
      } catch (error) {
        this.recordFailure(logGroupName, source, datapoints, error);
      }
    });
  }

  private recordFailure(
    logGroupName: string,
    source: SimLogsMetricPublicationSource,
    datapoints: readonly SimLogsMetricDatapoint[],
    error: unknown,
  ): void {
    const reason = error instanceof Error ? error.message : String(error);

    for (const datapoint of datapoints) {
      this.#failures.push({
        logGroupName,
        source,
        metricNamespace: datapoint.namespace,
        metricName: datapoint.metricName,
        reason,
      });
    }
  }
}
