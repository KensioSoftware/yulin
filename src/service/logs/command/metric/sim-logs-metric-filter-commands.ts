import type { SimClock } from "../../../../util/clock/sim-clock.js";
import { requiredSimLogsLogGroupName } from "../../group/sim-logs-log-group-name.js";
import type { SimLogsLogGroupStore } from "../../group/sim-logs-log-group-store.js";
import type { SimLogsMetricFanOut } from "../../metric/sim-logs-metric-fan-out.js";
import { SimLogsMetricFilter } from "../../metric/sim-logs-metric-filter.js";
import { simLogsSelectedMetricFilters } from "../../metric/sim-logs-metric-filter-selection.js";
import type { SimLogsAuthorizer } from "../authorize/sim-logs-authorizer.js";
import { SimLogsPage } from "../sim-logs-page.js";
import type { SimLogsRequestOptions } from "../sim-logs-request-options.js";
import { requiredSimLogsFilterName } from "../subscription/sim-logs-subscription-input.js";
import {
  requiredSimLogsMetricTransformations,
  simLogsMetricFilterDetail,
} from "./sim-logs-metric-filter-input.js";
import type {
  SimDeleteMetricFilterCommand,
  SimDeleteMetricFilterCommandOutput,
  SimDescribeMetricFiltersCommand,
  SimDescribeMetricFiltersCommandOutput,
  SimPutMetricFilterCommand,
  SimPutMetricFilterCommandOutput,
} from "./metric-filter.command.js";

const maximumDescribeLimit = 50;

interface SimLogsMetricFilterCommandsProperties {
  readonly groups: SimLogsLogGroupStore;
  readonly authorizer: SimLogsAuthorizer;
  readonly fanOut: SimLogsMetricFanOut;
  readonly clock: SimClock;
}

/**
 * The commands that put, describe and remove metric filters.
 */
export class SimLogsMetricFilterCommands {
  readonly #groups: SimLogsLogGroupStore;
  readonly #authorizer: SimLogsAuthorizer;
  readonly #fanOut: SimLogsMetricFanOut;
  readonly #clock: SimClock;

  constructor(properties: SimLogsMetricFilterCommandsProperties) {
    this.#groups = properties.groups;
    this.#authorizer = properties.authorizer;
    this.#fanOut = properties.fanOut;
    this.#clock = properties.clock;
  }

  /**
   * Put a metric filter on a log group.
   *
   * Whether the datapoints could go anywhere is checked here, the way
   * `PutSubscriptionFilter` checks its destination. A filter that takes its
   * configuration and publishes nothing is worse than a failure, because the
   * alarm over its metric then reports healthy for ever.
   */
  async putMetricFilter(
    command: SimPutMetricFilterCommand,
    options?: SimLogsRequestOptions,
  ): Promise<SimPutMetricFilterCommandOutput> {
    const input = command.input;
    const logGroupName = requiredSimLogsLogGroupName(input.logGroupName);
    const filterName = requiredSimLogsFilterName(input.filterName);
    const transformations = requiredSimLogsMetricTransformations(
      input.metricTransformations,
    );

    this.#authorizer.authorizeLogGroup(
      "logs:PutMetricFilter",
      logGroupName,
      options?.caller,
    );

    const group = this.#groups.require(logGroupName);

    await this.#fanOut.checkPublishable();

    group.metricFilters.put(
      new SimLogsMetricFilter({
        filterName,
        logGroupName,
        filterPattern: input.filterPattern,
        transformations,
        creationTime: this.#clock.now().getTime(),
      }),
    );

    return { $metadata: {} };
  }

  /**
   * Describe metric filters, on one log group or across them all.
   *
   * Real CloudWatch Logs takes `logGroupName` as optional here, unlike
   * `DescribeSubscriptionFilters`. Leaving it off is how a caller finds every
   * filter writing to a metric it has an alarm on.
   */
  describeMetricFilters(
    command: SimDescribeMetricFiltersCommand,
    options?: SimLogsRequestOptions,
  ): SimDescribeMetricFiltersCommandOutput {
    const input = command.input;
    const page = new SimLogsPage({
      listed: this.selected(input, options),
      limit: input.limit,
      nextToken: input.nextToken,
      maximumLimit: maximumDescribeLimit,
    });

    return {
      $metadata: {},
      metricFilters: page.items.map((filter) =>
        simLogsMetricFilterDetail(filter),
      ),
      nextToken: page.nextToken,
    };
  }

  /**
   * Remove a metric filter from a log group.
   */
  deleteMetricFilter(
    command: SimDeleteMetricFilterCommand,
    options?: SimLogsRequestOptions,
  ): SimDeleteMetricFilterCommandOutput {
    const input = command.input;
    const logGroupName = requiredSimLogsLogGroupName(input.logGroupName);
    const filterName = requiredSimLogsFilterName(input.filterName);

    this.#authorizer.authorizeLogGroup(
      "logs:DeleteMetricFilter",
      logGroupName,
      options?.caller,
    );

    this.#groups.require(logGroupName).metricFilters.delete(filterName);

    return { $metadata: {} };
  }

  /**
   * The filters one describe request selects, authorized for what it reaches.
   *
   * A request naming no log group reaches every one in the scope, so it is
   * authorized against them all rather than against any single group.
   */
  private selected(
    input: SimDescribeMetricFiltersCommand["input"],
    options: SimLogsRequestOptions | undefined,
  ): readonly SimLogsMetricFilter[] {
    const action = "logs:DescribeMetricFilters";

    if (input.logGroupName === undefined) {
      this.#authorizer.authorizeAnyLogGroup(action, options?.caller);

      return this.#groups.all.flatMap((group) =>
        simLogsSelectedMetricFilters(group.metricFilters.all, input),
      );
    }

    const logGroupName = requiredSimLogsLogGroupName(input.logGroupName);

    this.#authorizer.authorizeLogGroup(action, logGroupName, options?.caller);

    return simLogsSelectedMetricFilters(
      this.#groups.require(logGroupName).metricFilters.all,
      input,
    );
  }
}
