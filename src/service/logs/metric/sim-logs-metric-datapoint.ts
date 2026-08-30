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
 * This is what simulated CloudWatch Logs hands to simulated CloudWatch. The
 * timestamp is the instant CloudWatch Logs took the event, rather than the
 * instant the datapoint reaches the metric store. Publication happens on the
 * background scheduler, so a clock that moved in between would otherwise put
 * the datapoint in a later period than the log line it counts.
 */
export interface SimLogsMetricDatapoint {
  readonly namespace: string;
  readonly metricName: string;
  readonly value: number;
  readonly timestamp: number;
  readonly unit: string | undefined;
  readonly dimensions: readonly SimLogsMetricDimension[];
}
