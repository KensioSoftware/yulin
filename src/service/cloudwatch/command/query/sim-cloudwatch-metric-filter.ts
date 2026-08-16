import type {
  SimCloudWatchDimensionFilter,
  SimCloudWatchMetricFilter,
} from "../../metric/sim-cloudwatch-metric-store.js";
import { requiredSimCloudWatchName } from "../../metric/sim-cloudwatch-name.js";
import { requiredSimCloudWatchNamespace } from "../../metric/sim-cloudwatch-namespace.js";
import type {
  SimCloudWatchDimensionFilterInput,
  SimListMetricsCommandInput,
} from "./query.command.js";

/**
 * Read which metrics a listing selects.
 *
 * Every part is optional, and an omitted one selects everything rather than
 * nothing. The ones that are given are read as strictly as a published metric
 * is, so a listing asking for a name real CloudWatch could not hold is refused
 * rather than answered with nothing.
 */
export function simCloudWatchMetricFilter(
  input: SimListMetricsCommandInput,
): SimCloudWatchMetricFilter {
  return {
    namespace: optional(input.Namespace, requiredSimCloudWatchNamespace),
    metricName: optional(input.MetricName, (value) =>
      requiredSimCloudWatchName("MetricName", value),
    ),
    dimensions: dimensionFilters(input.Dimensions),
  };
}

function dimensionFilters(
  filters: readonly SimCloudWatchDimensionFilterInput[] | undefined,
): readonly SimCloudWatchDimensionFilter[] | undefined {
  return filters?.map((filter) => ({
    name: requiredSimCloudWatchName("Dimension.Name", filter.Name),
    value: optional(filter.Value, (value) =>
      requiredSimCloudWatchName("Dimension.Value", value),
    ),
  }));
}

function optional(
  value: string | undefined,
  read: (value: string) => string,
): string | undefined {
  return value === undefined ? undefined : read(value);
}
