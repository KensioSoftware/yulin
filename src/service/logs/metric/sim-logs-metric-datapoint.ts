/**
 * One dimension on a metric a metric filter publishes.
 */
export interface SimLogsMetricDimension {
  readonly name: string;
  readonly value: string;
}

/**
 * One metric datapoint a metric filter's transformation produced from a log
 * event.
 *
 * This is what simulated CloudWatch Logs hands to simulated CloudWatch, and it
 * carries no timestamp. Real CloudWatch stamps a filter's datapoint with the
 * time the event was ingested, and the simulation's clock is what both
 * services already read that from.
 */
export interface SimLogsMetricDatapoint {
  readonly namespace: string;
  readonly metricName: string;
  readonly value: number;
  readonly unit: string | undefined;
  readonly dimensions: readonly SimLogsMetricDimension[];
}
