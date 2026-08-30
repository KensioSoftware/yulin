import type { SimLogsMetricDatapoint } from "./sim-logs-metric-datapoint.js";

/**
 * Where a log group's metric datapoints are published.
 *
 * A simulated CloudWatch Logs reached through a `SimAws` Account Region scope
 * has one of these, pointing at that scope's own CloudWatch. One built on its
 * own has none, and reads no metrics out of what is written to it.
 */
export interface SimLogsMetricPublications {
  publish(datapoints: readonly SimLogsMetricDatapoint[]): Promise<void>;
}
