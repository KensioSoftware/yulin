import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimLogsMetricTransformationInput } from "../../command/metric/metric-filter.command.js";
import { simCfnMetricDimensions } from "./sim-cfn-metric-dimension-values.js";
import {
  metricFilterList,
  metricFilterNumber,
  metricFilterRecord,
  metricFilterString,
} from "./sim-cfn-metric-filter-value.js";

/**
 * Read the MetricTransformations of an AWS::Logs::MetricFilter Resource.
 */
export function simCfnMetricTransformations(
  logicalId: string,
  value: SimCfnTemplateValue | undefined,
): readonly SimLogsMetricTransformationInput[] {
  return metricFilterList(logicalId, value, "MetricTransformations").map(
    (entry) => transformation(logicalId, entry),
  );
}

function transformation(
  logicalId: string,
  value: SimCfnTemplateValue,
): SimLogsMetricTransformationInput {
  const read = metricFilterRecord(
    logicalId,
    value,
    "MetricTransformations entry",
  );

  return {
    metricName: metricFilterString(logicalId, read["MetricName"], "MetricName"),
    metricNamespace: metricFilterString(
      logicalId,
      read["MetricNamespace"],
      "MetricNamespace",
    ),
    metricValue: metricFilterString(
      logicalId,
      read["MetricValue"],
      "MetricValue",
    ),
    defaultValue: metricFilterNumber(
      logicalId,
      read["DefaultValue"],
      "DefaultValue",
    ),
    unit: metricFilterString(logicalId, read["Unit"], "Unit"),
    dimensions: simCfnMetricDimensions(logicalId, read["Dimensions"]),
  };
}
