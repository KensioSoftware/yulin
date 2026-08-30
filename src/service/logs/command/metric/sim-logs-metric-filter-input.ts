import { SimLogsInvalidParameterException } from "../../error/sim-logs.error.js";
import type { SimLogsMetricDimension } from "../../metric/sim-logs-metric-datapoint.js";
import type { SimLogsMetricFilter } from "../../metric/sim-logs-metric-filter.js";
import { SimLogsMetricTransformation } from "../../metric/sim-logs-metric-transformation.js";
import type {
  SimLogsMetricFilterDetail,
  SimLogsMetricTransformationInput,
} from "./metric-filter.command.js";

/**
 * How many transformations real CloudWatch Logs allows on one metric filter.
 *
 * One. The field is a list because the API has always shaped it that way, and
 * an account refuses a second entry.
 */
const maximumTransformations = 1;

/**
 * Read the transformations a metric filter publishes through.
 */
export function requiredSimLogsMetricTransformations(
  transformations?: readonly SimLogsMetricTransformationInput[],
): readonly SimLogsMetricTransformation[] {
  if (transformations === undefined || transformations.length === 0) {
    throw new SimLogsInvalidParameterException(
      "1 validation error detected: Value at 'metricTransformations' failed " +
        "to satisfy constraint: Member must not be null",
    );
  }

  if (transformations.length > maximumTransformations) {
    throw new SimLogsInvalidParameterException(
      `1 validation error detected: Value at 'metricTransformations' failed ` +
        `to satisfy constraint: Member must have length less than or equal ` +
        `to ${maximumTransformations}`,
    );
  }

  return transformations.map((transformation) =>
    metricTransformation(transformation),
  );
}

/**
 * Read one transformation, refusing what real CloudWatch Logs refuses.
 */
function metricTransformation(
  input: SimLogsMetricTransformationInput,
): SimLogsMetricTransformation {
  return new SimLogsMetricTransformation({
    metricNamespace: requiredTransformationField(
      "metricNamespace",
      input.metricNamespace,
    ),
    metricName: requiredTransformationField("metricName", input.metricName),
    metricValue: requiredTransformationField("metricValue", input.metricValue),
    defaultValue: input.defaultValue,
    unit: input.unit,
    dimensions: metricDimensions(input.dimensions),
  });
}

/**
 * Read a transformation field the API requires.
 */
function requiredTransformationField(
  name: string,
  value: string | undefined,
): string {
  if (value === undefined || value.length === 0) {
    throw new SimLogsInvalidParameterException(
      `1 validation error detected: Value at ` +
        `'metricTransformations.member.${name}' failed to satisfy ` +
        `constraint: Member must not be null`,
    );
  }

  return value;
}

/**
 * Read a transformation's dimensions from the map the SDK carries them in.
 */
function metricDimensions(
  dimensions: Readonly<Record<string, string>> | undefined,
): readonly SimLogsMetricDimension[] {
  return Object.entries(dimensions ?? {}).map(([name, value]) => ({
    name,
    value,
  }));
}

/**
 * What DescribeMetricFilters reports about one filter.
 */
export function simLogsMetricFilterDetail(
  filter: SimLogsMetricFilter,
): SimLogsMetricFilterDetail {
  return {
    filterName: filter.filterName,
    logGroupName: filter.logGroupName,
    filterPattern: filter.filterPatternText,
    metricTransformations: filter.transformations.map((transformation) => ({
      metricName: transformation.metricName,
      metricNamespace: transformation.metricNamespace,
      metricValue: transformation.metricValue,
      defaultValue: transformation.defaultValue,
      unit: transformation.unit,
      dimensions: Object.fromEntries(
        transformation.dimensions.map((dimension) => [
          dimension.name,
          dimension.value,
        ]),
      ),
    })),
    creationTime: filter.creationTime,
  };
}
