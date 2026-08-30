import { SimLogsUnsupportedOperationException } from "../error/sim-logs.error.js";
import type { SimLogsMetricDatapoint } from "./sim-logs-metric-datapoint.js";

/**
 * Where a metric filter's datapoints are published.
 *
 * One method, and publishing nothing is how a filter about to be put asks
 * whether publishing would work at all. Real CloudWatch Logs takes a metric
 * filter whatever else is in the account, because the metric it writes into is
 * made by the first write. The question here is about this simulation instead.
 * A `SimLogs` with no CloudWatch to publish into would hold a filter and drop
 * every datapoint, and a filter that accepts its configuration and publishes
 * nothing is the hardest kind of thing to find.
 */
export interface SimLogsMetricPublications {
  publish(datapoints: readonly SimLogsMetricDatapoint[]): Promise<void>;
}

/**
 * The publications a simulated CloudWatch Logs built on its own can make,
 * which is none.
 *
 * A standalone SimLogs has no simulated CloudWatch to put a datapoint into, so
 * a metric filter on one is refused when it is put rather than accepted and
 * left publishing nowhere.
 */
export class SimLogsNoMetricPublications implements SimLogsMetricPublications {
  /**
   * Refuse every publication, explaining how to get one.
   */
  publish(): Promise<void> {
    return Promise.reject(
      new SimLogsUnsupportedOperationException(
        "This simulated CloudWatch Logs has no simulated CloudWatch to " +
          "publish a metric filter's datapoints into. Reach CloudWatch Logs " +
          "through a SimAws Account Region scope for a metric filter to " +
          "publish.",
      ),
    );
  }
}
