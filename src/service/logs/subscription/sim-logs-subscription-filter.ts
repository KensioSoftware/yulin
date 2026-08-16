import { SimLogsFilterPattern } from "../event/sim-logs-filter-pattern.js";

interface SimLogsSubscriptionFilterProperties {
  readonly filterName: string;
  readonly logGroupName: string;
  readonly filterPattern: string | undefined;
  readonly destinationArn: string;
  readonly roleArn: string | undefined;
  readonly distribution: string | undefined;
  readonly creationTime: number;
}

/**
 * One subscription filter on a log group.
 *
 * The pattern is compiled once, when the filter is put, so a pattern this
 * simulator cannot read is refused there rather than on the first event that
 * happens to arrive. Real CloudWatch Logs validates it at `PutSubscriptionFilter`
 * too.
 */
export class SimLogsSubscriptionFilter {
  readonly filterName: string;
  readonly logGroupName: string;
  readonly filterPatternText: string;
  readonly destinationArn: string;
  readonly roleArn: string | undefined;
  readonly distribution: string | undefined;
  readonly creationTime: number;

  readonly #pattern: SimLogsFilterPattern;

  constructor(properties: SimLogsSubscriptionFilterProperties) {
    this.filterName = properties.filterName;
    this.logGroupName = properties.logGroupName;
    this.filterPatternText = properties.filterPattern ?? "";
    this.destinationArn = properties.destinationArn;
    this.roleArn = properties.roleArn;
    this.distribution = properties.distribution;
    this.creationTime = properties.creationTime;
    this.#pattern = new SimLogsFilterPattern(properties.filterPattern);
  }

  /**
   * Whether this filter wants an event's message.
   */
  wants(message: string): boolean {
    return this.#pattern.matches(message);
  }
}
