import {
  SimLogsLimitExceededException,
  SimLogsResourceNotFoundException,
} from "../error/sim-logs.error.js";
import type { SimLogsSubscriptionFilter } from "./sim-logs-subscription-filter.js";

/**
 * How many subscription filters real CloudWatch Logs allows on one log group.
 *
 * Two is the current account default. It used to be one, which is why a
 * template written a few years ago assumes a group can only have the one, and
 * why exceeding it is worth failing on rather than quietly allowing.
 */
export const simLogsMaximumSubscriptionFilters = 2;

/**
 * The subscription filters on one log group.
 *
 * They belong to the group rather than to the service, as its streams do: a
 * filter has no identity outside the group it watches, and deleting the group
 * takes its filters with it.
 */
export class SimLogsSubscriptionFilterStore {
  readonly #filters = new Map<string, SimLogsSubscriptionFilter>();

  /**
   * Every filter on this group, in the order they were put.
   */
  get all(): readonly SimLogsSubscriptionFilter[] {
    return this.#filters.values().toArray();
  }

  /**
   * Put a filter, replacing one of the same name.
   *
   * Putting a filter that is already there by name is an update rather than a
   * second filter, which is what makes `PutSubscriptionFilter` the way to
   * change a pattern. Only a new name counts against the limit.
   */
  put(filter: SimLogsSubscriptionFilter): void {
    if (
      !this.#filters.has(filter.filterName) &&
      this.#filters.size >= simLogsMaximumSubscriptionFilters
    ) {
      throw new SimLogsLimitExceededException(
        `Resource limit exceeded: a log group may have at most ` +
          `${simLogsMaximumSubscriptionFilters} subscription filters`,
      );
    }

    this.#filters.set(filter.filterName, filter);
  }

  /**
   * Remove a filter by name, refusing one that is not there.
   */
  delete(filterName: string): void {
    if (!this.#filters.delete(filterName)) {
      throw new SimLogsResourceNotFoundException(
        "The specified subscription filter does not exist.",
      );
    }
  }

  /**
   * The filters whose names start with a prefix, in the order they were put.
   */
  withNamePrefix(
    prefix: string | undefined,
  ): readonly SimLogsSubscriptionFilter[] {
    return this.all.filter((filter) =>
      filter.filterName.startsWith(prefix ?? ""),
    );
  }
}
