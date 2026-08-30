import type { SimLogsMetricFilter } from "./sim-logs-metric-filter.js";

/**
 * What a DescribeMetricFilters request is selecting on, beyond the log group.
 */
export interface SimLogsMetricFilterSelection {
  readonly filterNamePrefix?: string | undefined;
  readonly metricName?: string | undefined;
  readonly metricNamespace?: string | undefined;
}

/**
 * The filters a request selects, by name prefix and by the metric they write.
 *
 * Selecting on the metric is what makes a request naming no log group useful.
 * It is how a caller finds every filter writing to a metric it has an alarm
 * on, wherever in the account those filters were put.
 */
export function simLogsSelectedMetricFilters(
  filters: readonly SimLogsMetricFilter[],
  selection: SimLogsMetricFilterSelection,
): readonly SimLogsMetricFilter[] {
  return filters.filter(
    (filter) =>
      filter.filterName.startsWith(selection.filterNamePrefix ?? "") &&
      writesTheMetric(filter, selection),
  );
}

function writesTheMetric(
  filter: SimLogsMetricFilter,
  selection: SimLogsMetricFilterSelection,
): boolean {
  return filter.transformations.some(
    (transformation) =>
      (selection.metricNamespace === undefined ||
        transformation.metricNamespace === selection.metricNamespace) &&
      (selection.metricName === undefined ||
        transformation.metricName === selection.metricName),
  );
}
