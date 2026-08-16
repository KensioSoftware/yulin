import { requiredSimCloudWatchDimensions } from "../../metric/sim-cloudwatch-dimension.js";
import type { SimCloudWatchMetricStore } from "../../metric/sim-cloudwatch-metric-store.js";
import { requiredSimCloudWatchName } from "../../metric/sim-cloudwatch-name.js";
import { requiredSimCloudWatchNamespace } from "../../metric/sim-cloudwatch-namespace.js";
import { requiredSimCloudWatchPeriod } from "../../metric/sim-cloudwatch-period.js";
import { requiredSimCloudWatchTimeRange } from "../../metric/sim-cloudwatch-time-range.js";
import type { SimCloudWatchAuthorizer } from "../authorize/sim-cloudwatch-authorizer.js";
import type { SimCloudWatchRequestOptions } from "../sim-cloudwatch-request-options.js";
import type {
  SimGetMetricStatisticsCommand,
  SimGetMetricStatisticsCommandOutput,
} from "./query.command.js";
import { requiredSimCloudWatchStatistics } from "./sim-cloudwatch-requested-statistics.js";
import {
  refuseTooManySimCloudWatchPeriods,
  simCloudWatchStatisticDatapoints,
} from "./sim-cloudwatch-statistic-datapoints.js";

const getMetricStatisticsAction = "cloudwatch:GetMetricStatistics";

interface SimCloudWatchGetMetricStatisticsProperties {
  readonly metrics: SimCloudWatchMetricStore;
  readonly authorizer: SimCloudWatchAuthorizer;
}

/**
 * The command that reads one metric back as statistics over periods.
 *
 * A metric nothing has been written to is not an error: real CloudWatch answers
 * a request for one with no datapoints rather than a failure, since a metric
 * only exists once something publishes to it.
 */
export class SimCloudWatchGetMetricStatistics {
  readonly #metrics: SimCloudWatchMetricStore;
  readonly #authorizer: SimCloudWatchAuthorizer;

  constructor(properties: SimCloudWatchGetMetricStatisticsProperties) {
    this.#metrics = properties.metrics;
    this.#authorizer = properties.authorizer;
  }

  /**
   * Answer with one datapoint per period holding observations.
   */
  handle(
    command: SimGetMetricStatisticsCommand,
    options?: SimCloudWatchRequestOptions,
  ): SimGetMetricStatisticsCommandOutput {
    const input = command.input;

    // Before the input is read, because real IAM decides a request before the
    // service handles it: an unauthorized caller is refused whether or not
    // what it sent would have been valid.
    this.#authorizer.authorize(getMetricStatisticsAction, options?.caller);

    const identity = {
      namespace: requiredSimCloudWatchNamespace(input.Namespace),
      metricName: requiredSimCloudWatchName("MetricName", input.MetricName),
      dimensions: requiredSimCloudWatchDimensions(input.Dimensions),
    };
    const statistics = requiredSimCloudWatchStatistics(
      input.Statistics,
      input.ExtendedStatistics,
    );
    const range = requiredSimCloudWatchTimeRange(
      input.StartTime,
      input.EndTime,
    );
    const period = requiredSimCloudWatchPeriod(input.Period);

    refuseTooManySimCloudWatchPeriods(range.endTime - range.startTime, period);

    const found = this.#metrics.find(identity);
    const selected = found?.within({ ...range, unit: input.Unit }) ?? [];

    return {
      $metadata: {},
      Label: identity.metricName,
      Datapoints: simCloudWatchStatisticDatapoints(
        selected,
        period,
        statistics,
      ),
    };
  }
}
