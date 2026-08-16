import type { SimClock } from "../../../../util/clock/sim-clock.js";
import { requiredSimLogsLogGroupName } from "../../group/sim-logs-log-group-name.js";
import type { SimLogsLogGroupStore } from "../../group/sim-logs-log-group-store.js";
import type { SimLogsSubscriptionDestinations } from "../../subscription/sim-logs-subscription-destinations.js";
import { SimLogsSubscriptionFilter } from "../../subscription/sim-logs-subscription-filter.js";
import {
  requiredSimLogsDestinationArn,
  requiredSimLogsFilterName,
  simLogsFilterDetail,
} from "./sim-logs-subscription-input.js";
import type { SimLogsAuthorizer } from "../authorize/sim-logs-authorizer.js";
import { SimLogsPage } from "../sim-logs-page.js";
import type { SimLogsRequestOptions } from "../sim-logs-request-options.js";
import type {
  SimDeleteSubscriptionFilterCommand,
  SimDeleteSubscriptionFilterCommandOutput,
  SimDescribeSubscriptionFiltersCommand,
  SimDescribeSubscriptionFiltersCommandOutput,
  SimPutSubscriptionFilterCommand,
  SimPutSubscriptionFilterCommandOutput,
} from "./subscription.command.js";

const maximumDescribeLimit = 50;

interface SimLogsSubscriptionCommandsProperties {
  readonly groups: SimLogsLogGroupStore;
  readonly authorizer: SimLogsAuthorizer;
  readonly destinations: SimLogsSubscriptionDestinations;
  readonly clock: SimClock;
}

/**
 * The commands that put, describe and remove subscription filters.
 */
export class SimLogsSubscriptionCommands {
  readonly #groups: SimLogsLogGroupStore;
  readonly #authorizer: SimLogsAuthorizer;
  readonly #destinations: SimLogsSubscriptionDestinations;
  readonly #clock: SimClock;

  constructor(properties: SimLogsSubscriptionCommandsProperties) {
    this.#groups = properties.groups;
    this.#authorizer = properties.authorizer;
    this.#destinations = properties.destinations;
    this.#clock = properties.clock;
  }

  /**
   * Put a subscription filter on a log group.
   *
   * The destination is checked here, as real CloudWatch Logs checks it: a
   * function it cannot invoke fails the call rather than leaving a filter that
   * silently drops every event from then on.
   */
  async putSubscriptionFilter(
    command: SimPutSubscriptionFilterCommand,
    options?: SimLogsRequestOptions,
  ): Promise<SimPutSubscriptionFilterCommandOutput> {
    const input = command.input;
    const logGroupName = requiredSimLogsLogGroupName(input.logGroupName);
    const filterName = requiredSimLogsFilterName(input.filterName);
    const destinationArn = requiredSimLogsDestinationArn(input.destinationArn);

    this.#authorizer.authorizeLogGroup(
      "logs:PutSubscriptionFilter",
      logGroupName,
      options?.caller,
    );

    const group = this.#groups.require(logGroupName);

    await this.#destinations.check(destinationArn);

    group.subscriptionFilters.put(
      new SimLogsSubscriptionFilter({
        filterName,
        logGroupName,
        filterPattern: input.filterPattern,
        destinationArn,
        roleArn: input.roleArn,
        distribution: input.distribution,
        creationTime: this.#clock.now().getTime(),
      }),
    );

    return { $metadata: {} };
  }

  /**
   * Describe the subscription filters on a log group.
   */
  describeSubscriptionFilters(
    command: SimDescribeSubscriptionFiltersCommand,
    options?: SimLogsRequestOptions,
  ): SimDescribeSubscriptionFiltersCommandOutput {
    const input = command.input;
    const logGroupName = requiredSimLogsLogGroupName(input.logGroupName);

    this.#authorizer.authorizeLogGroup(
      "logs:DescribeSubscriptionFilters",
      logGroupName,
      options?.caller,
    );

    const group = this.#groups.require(logGroupName);
    const page = new SimLogsPage({
      listed: group.subscriptionFilters.withNamePrefix(input.filterNamePrefix),
      limit: input.limit,
      nextToken: input.nextToken,
      maximumLimit: maximumDescribeLimit,
    });

    return {
      $metadata: {},
      subscriptionFilters: page.items.map((filter) =>
        simLogsFilterDetail(filter),
      ),
      nextToken: page.nextToken,
    };
  }

  /**
   * Remove a subscription filter from a log group.
   */
  deleteSubscriptionFilter(
    command: SimDeleteSubscriptionFilterCommand,
    options?: SimLogsRequestOptions,
  ): SimDeleteSubscriptionFilterCommandOutput {
    const input = command.input;
    const logGroupName = requiredSimLogsLogGroupName(input.logGroupName);
    const filterName = requiredSimLogsFilterName(input.filterName);

    this.#authorizer.authorizeLogGroup(
      "logs:DeleteSubscriptionFilter",
      logGroupName,
      options?.caller,
    );

    this.#groups.require(logGroupName).subscriptionFilters.delete(filterName);

    return { $metadata: {} };
  }
}
