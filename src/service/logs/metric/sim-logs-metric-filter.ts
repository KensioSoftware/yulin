import type { SimLogsStoredEvent } from "../event/sim-logs-event.js";
import { SimLogsFilterPattern } from "../event/sim-logs-filter-pattern.js";
import type { SimLogsMetricDatapoint } from "./sim-logs-metric-datapoint.js";
import type { SimLogsMetricTransformation } from "./sim-logs-metric-transformation.js";

/**
 * How long a metric filter's aggregation period is.
 *
 * Real CloudWatch Logs aggregates and reports a filter's metric every minute,
 * and the default value is what it reports for a minute that took log events
 * and matched none of them.
 */
const periodMilliseconds = 60_000;

interface SimLogsMetricFilterProperties {
  readonly filterName: string;
  readonly logGroupName: string;
  readonly filterPattern: string | undefined;
  readonly transformations: readonly SimLogsMetricTransformation[];
  readonly creationTime: number;
}

/**
 * One metric filter on a log group.
 *
 * The pattern is compiled once, when the filter is put, the way a subscription
 * filter's is. A pattern this simulator cannot read is refused there rather
 * than on the first event that happens to arrive.
 */
export class SimLogsMetricFilter {
  readonly filterName: string;
  readonly logGroupName: string;
  readonly filterPatternText: string;
  readonly transformations: readonly SimLogsMetricTransformation[];
  readonly creationTime: number;

  readonly #pattern: SimLogsFilterPattern;

  /**
   * The most recent period this filter matched something in.
   *
   * One period is remembered rather than all of them, so a filter cannot grow
   * without bound over a long run. It is what stops a second write in a minute
   * a match already landed in from publishing a default value over the top.
   */
  #matchedPeriod: number | undefined;

  constructor(properties: SimLogsMetricFilterProperties) {
    this.filterName = properties.filterName;
    this.logGroupName = properties.logGroupName;
    this.filterPatternText = properties.filterPattern ?? "";
    this.transformations = properties.transformations;
    this.creationTime = properties.creationTime;
    this.#pattern = new SimLogsFilterPattern(properties.filterPattern);
  }

  /**
   * Whether this filter matches an event's message.
   */
  matches(message: string): boolean {
    return this.#pattern.matches(message);
  }

  /**
   * The datapoints a batch of log events publishes through this filter.
   *
   * A matching event publishes one datapoint per transformation, stamped with
   * the instant CloudWatch Logs took it.
   *
   * A default value is published once for a period that took events and
   * matched none of them, rather than once per event that missed. That is what
   * real CloudWatch Logs reports: a minute with two records and one match
   * counts one, and a minute with two records and no match reports the default
   * once. Publishing per event would inflate `SampleCount` and change what an
   * alarm over the metric decides.
   */
  datapoints(
    events: readonly SimLogsStoredEvent[],
  ): readonly SimLogsMetricDatapoint[] {
    const published: SimLogsMetricDatapoint[] = [];

    for (const [period, inPeriod] of byPeriod(events)) {
      published.push(...this.periodDatapoints(period, inPeriod));
    }

    return published;
  }

  /**
   * What one period of events publishes.
   */
  private periodDatapoints(
    period: number,
    events: readonly SimLogsStoredEvent[],
  ): readonly SimLogsMetricDatapoint[] {
    const matched = events.filter((event) => this.matches(event.message));

    if (matched.length > 0) {
      this.#matchedPeriod = period;

      return matched.flatMap((event) =>
        this.transformations.map((transformation) =>
          transformation.matched(event.ingestionTime),
        ),
      );
    }

    if (this.#matchedPeriod === period) {
      return [];
    }

    return this.transformations
      .map((transformation) => transformation.unmatched(period))
      .filter((datapoint) => datapoint !== undefined);
  }
}

/**
 * A batch's events grouped into the aggregation periods they were taken in.
 */
function byPeriod(
  events: readonly SimLogsStoredEvent[],
): ReadonlyMap<number, readonly SimLogsStoredEvent[]> {
  const grouped = new Map<number, SimLogsStoredEvent[]>();

  for (const event of events) {
    const period =
      Math.floor(event.ingestionTime / periodMilliseconds) * periodMilliseconds;
    const inPeriod = grouped.get(period) ?? [];

    inPeriod.push(event);
    grouped.set(period, inPeriod);
  }

  return grouped;
}
