import { SimLogsResourceNotFoundException } from "../error/sim-logs.error.js";
import type { SimLogsMetricFilter } from "./sim-logs-metric-filter.js";

/**
 * The metric filters on one log group.
 *
 * They belong to the group the way its subscription filters and its streams
 * do. A metric filter has no identity outside the group it watches, and
 * deleting the group takes its filters with it.
 */
export class SimLogsMetricFilterStore {
  readonly #filters = new Map<string, SimLogsMetricFilter>();

  /**
   * Every filter on this group, in the order they were put.
   */
  get all(): readonly SimLogsMetricFilter[] {
    return this.#filters.values().toArray();
  }

  /**
   * How many filters this group has, which is what `DescribeLogGroups` reports
   * as `metricFilterCount`.
   */
  get count(): number {
    return this.#filters.size;
  }

  /**
   * Find a filter on this group by name.
   */
  find(filterName: string): SimLogsMetricFilter | undefined {
    return this.#filters.get(filterName);
  }

  /**
   * Put a filter, replacing one of the same name.
   *
   * Putting a filter already there by name is an update rather than a second
   * filter, which is what makes `PutMetricFilter` the way to change a pattern.
   */
  put(filter: SimLogsMetricFilter): void {
    this.#filters.set(filter.filterName, filter);
  }

  /**
   * Remove a filter by name, refusing one that was never there.
   */
  delete(filterName: string): void {
    if (!this.#filters.delete(filterName)) {
      throw new SimLogsResourceNotFoundException(
        "The specified metric filter does not exist.",
      );
    }
  }
}
