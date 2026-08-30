import { SimLogsFilterPattern } from "../event/sim-logs-filter-pattern.js";
import type { SimLogsMetricDatapoint } from "./sim-logs-metric-datapoint.js";
import type { SimLogsMetricTransformation } from "./sim-logs-metric-transformation.js";

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
   * The datapoints one log event publishes through this filter.
   *
   * A matching event publishes one datapoint per transformation. An event that
   * matched nothing publishes a transformation's default value where it sets
   * one, which is how real CloudWatch Logs keeps a metric reporting zero over
   * a period where the term never appeared.
   */
  datapoints(message: string): readonly SimLogsMetricDatapoint[] {
    const matched = this.matches(message);

    return this.transformations
      .map((transformation) =>
        matched ? transformation.matched() : transformation.unmatched(),
      )
      .filter((datapoint) => datapoint !== undefined);
  }
}
