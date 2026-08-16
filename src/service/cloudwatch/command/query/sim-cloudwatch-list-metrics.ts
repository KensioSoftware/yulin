import type { SimClock } from "../../../../util/clock/sim-clock.js";
import type { SimCloudWatchMetricStore } from "../../metric/sim-cloudwatch-metric-store.js";
import type { SimCloudWatchAuthorizer } from "../authorize/sim-cloudwatch-authorizer.js";
import { SimCloudWatchPage } from "../sim-cloudwatch-page.js";
import type { SimCloudWatchRequestOptions } from "../sim-cloudwatch-request-options.js";
import type {
  SimListMetricsCommand,
  SimListMetricsCommandOutput,
} from "./query.command.js";
import { simCloudWatchMetricFilter } from "./sim-cloudwatch-metric-filter.js";
import {
  isSimCloudWatchRecentlyActive,
  refuseSimCloudWatchLinkedAccounts,
  simCloudWatchMetricDetail,
} from "./sim-cloudwatch-metric-listing.js";

const listMetricsAction = "cloudwatch:ListMetrics";

/**
 * How many metrics real CloudWatch reports in one page of a listing.
 */
const metricsPerPage = 500;

interface SimCloudWatchListMetricsProperties {
  readonly metrics: SimCloudWatchMetricStore;
  readonly authorizer: SimCloudWatchAuthorizer;
  readonly clock: SimClock;
}

/**
 * The command that reports which metrics exist, without their values.
 */
export class SimCloudWatchListMetrics {
  readonly #metrics: SimCloudWatchMetricStore;
  readonly #authorizer: SimCloudWatchAuthorizer;
  readonly #clock: SimClock;

  constructor(properties: SimCloudWatchListMetricsProperties) {
    this.#metrics = properties.metrics;
    this.#authorizer = properties.authorizer;
    this.#clock = properties.clock;
  }

  /**
   * List the metrics a request selects, in the order each was first written to.
   */
  handle(
    command: SimListMetricsCommand,
    options?: SimCloudWatchRequestOptions,
  ): SimListMetricsCommandOutput {
    const input = command.input;

    // Before the input is read, because real IAM decides a request before the
    // service handles it.
    this.#authorizer.authorize(listMetricsAction, options?.caller);

    refuseSimCloudWatchLinkedAccounts(
      input.IncludeLinkedAccounts,
      input.OwningAccount,
    );

    const now = this.#clock.now();
    const selected = this.#metrics
      .matching(simCloudWatchMetricFilter(input))
      .filter((metric) =>
        isSimCloudWatchRecentlyActive(metric, input.RecentlyActive, now),
      );
    const page = new SimCloudWatchPage({
      listed: selected,
      nextToken: input.NextToken,
      pageSize: metricsPerPage,
    });

    return {
      $metadata: {},
      Metrics: page.items.map((metric) => simCloudWatchMetricDetail(metric)),
      NextToken: page.nextToken,
    };
  }
}
