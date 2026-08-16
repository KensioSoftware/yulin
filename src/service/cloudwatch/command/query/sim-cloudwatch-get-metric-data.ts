import type { SimCloudWatchMetricStore } from "../../metric/sim-cloudwatch-metric-store.js";
import { requiredSimCloudWatchTimeRange } from "../../metric/sim-cloudwatch-time-range.js";
import type { SimCloudWatchAuthorizer } from "../authorize/sim-cloudwatch-authorizer.js";
import type { SimCloudWatchRequestOptions } from "../sim-cloudwatch-request-options.js";
import type {
  SimGetMetricDataCommand,
  SimGetMetricDataCommandOutput,
} from "./query.command.js";
import { readSimCloudWatchMetricDataQuery } from "./sim-cloudwatch-metric-data-query.js";
import {
  refuseRepeatedSimCloudWatchQueryIds,
  refuseUnsimulatedSimCloudWatchPaging,
  requiredSimCloudWatchQueries,
  simCloudWatchScansAscending,
} from "./sim-cloudwatch-metric-data-request.js";
import { simCloudWatchMetricDataResult } from "./sim-cloudwatch-metric-data-result.js";

const getMetricDataAction = "cloudwatch:GetMetricData";

interface SimCloudWatchGetMetricDataProperties {
  readonly metrics: SimCloudWatchMetricStore;
  readonly authorizer: SimCloudWatchAuthorizer;
}

/**
 * The command that reads several metrics back in one request.
 *
 * Each query names its own metric, period and statistic, so this is the
 * operation to reach for when a test wants two metrics compared over the same
 * window. Metric math is not simulated, so every query here is a MetricStat.
 */
export class SimCloudWatchGetMetricData {
  readonly #metrics: SimCloudWatchMetricStore;
  readonly #authorizer: SimCloudWatchAuthorizer;

  constructor(properties: SimCloudWatchGetMetricDataProperties) {
    this.#metrics = properties.metrics;
    this.#authorizer = properties.authorizer;
  }

  /**
   * Answer one result per query that asked for its data back.
   */
  handle(
    command: SimGetMetricDataCommand,
    options?: SimCloudWatchRequestOptions,
  ): SimGetMetricDataCommandOutput {
    const input = command.input;

    // Before the input is read, because real IAM decides a request before the
    // service handles it.
    this.#authorizer.authorize(getMetricDataAction, options?.caller);

    refuseUnsimulatedSimCloudWatchPaging(input.MaxDatapoints, input.NextToken);

    const queries = requiredSimCloudWatchQueries(input.MetricDataQueries).map(
      (query) => readSimCloudWatchMetricDataQuery(query),
    );

    refuseRepeatedSimCloudWatchQueryIds(queries);

    const range = requiredSimCloudWatchTimeRange(
      input.StartTime,
      input.EndTime,
    );
    const ascending = simCloudWatchScansAscending(input.ScanBy);

    return {
      $metadata: {},
      MetricDataResults: queries
        .filter((query) => query.returnData)
        .map((query) =>
          simCloudWatchMetricDataResult({
            metrics: this.#metrics,
            query,
            range,
            ascending,
          }),
        ),
    };
  }
}
