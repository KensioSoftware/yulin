import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimLogsStoredEvent } from "../event/sim-logs-event.js";
import type { SimLogsLogGroup } from "../group/sim-logs-log-group.js";
import type { SimLogsSubscriptionDestinations } from "./sim-logs-subscription-destinations.js";
import type { SimLogsSubscriptionFilter } from "./sim-logs-subscription-filter.js";

/**
 * One delivery a subscription filter could not make.
 */
export interface SimLogsSubscriptionFailure {
  readonly logGroupName: string;
  readonly filterName: string;
  readonly destinationArn: string;
  readonly reason: string;
}

interface SimLogsSubscriptionFanOutProperties {
  readonly destinations: SimLogsSubscriptionDestinations;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly background: BackgroundScheduler;
}

/**
 * Hands events written to a log group to every subscription filter that wants
 * them.
 *
 * Delivery happens on the background scheduler, as real CloudWatch Logs
 * delivers after the write has been answered: `PutLogEvents` succeeds whether
 * or not anything downstream takes the events, and a destination that throws
 * must not fail the write that triggered it.
 * `simAws.backgroundTasksComplete()` is what waits for it.
 */
export class SimLogsSubscriptionFanOut {
  readonly #destinations: SimLogsSubscriptionDestinations;
  readonly #accountRegionScope: SimAwsAccountRegionScope;
  readonly #background: BackgroundScheduler;
  readonly #failures: SimLogsSubscriptionFailure[] = [];

  constructor(properties: SimLogsSubscriptionFanOutProperties) {
    this.#destinations = properties.destinations;
    this.#accountRegionScope = properties.accountRegionScope;
    this.#background = properties.background;
  }

  /**
   * Every delivery this scope could not make.
   *
   * A failed delivery is invisible in an account, where it becomes a metric
   * nobody is watching. Keeping it is what lets a test find out that the
   * subscription it set up never reached anything.
   */
  get failures(): readonly SimLogsSubscriptionFailure[] {
    return this.#failures;
  }

  /**
   * Schedule a delivery for every filter on the group that wants any of the
   * events.
   *
   * Each filter gets only the events its own pattern matched, in one delivery,
   * which is what real CloudWatch Logs batches: a handler receives the lines
   * it subscribed to rather than everything that happened to be written.
   */
  written(
    group: SimLogsLogGroup,
    logStreamName: string,
    events: readonly SimLogsStoredEvent[],
  ): void {
    for (const filter of group.subscriptionFilters.all) {
      const matched = events.filter((event) => filter.wants(event.message));

      if (matched.length > 0) {
        this.schedule(filter, logStreamName, matched);
      }
    }
  }

  private schedule(
    filter: SimLogsSubscriptionFilter,
    logStreamName: string,
    events: readonly SimLogsStoredEvent[],
  ): void {
    this.#background.schedule(async () => {
      try {
        await this.#destinations.deliver(filter.destinationArn, {
          owner: this.#accountRegionScope.accountId,
          logGroupName: filter.logGroupName,
          logStreamName,
          filterName: filter.filterName,
          events,
        });
      } catch (error) {
        this.#failures.push({
          logGroupName: filter.logGroupName,
          filterName: filter.filterName,
          destinationArn: filter.destinationArn,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    });
  }
}
