import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimLogsMetricTransformationInput } from "../../command/metric/metric-filter.command.js";
import {
  metricFilterList,
  metricFilterNumber,
  metricFilterRecord,
  metricFilterRequiredString,
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
    dimensions: dimensions(logicalId, read["Dimensions"]),
  };
}

/**
 * Read a transformation's dimensions into the map shape the API uses.
 *
 * The template carries them as a list of Key and Value pairs, and the SDK
 * carries the same thing as a map, so both routes reach one implementation.
 */
function dimensions(
  logicalId: string,
  value: SimCfnTemplateValue | undefined,
): Readonly<Record<string, string>> | undefined {
  if (value === undefined) {
    return undefined;
  }

  const listed = metricFilterList(
    logicalId,
    value,
    "MetricTransformations Dimensions",
  );

  return Object.fromEntries(
    listed.map((entry) => {
      const dimension = metricFilterRecord(
        logicalId,
        entry,
        "Dimensions entry",
      );

      return [
        metricFilterRequiredString(
          logicalId,
          dimension["Key"],
          "Dimensions Key",
        ),
        metricFilterRequiredString(
          logicalId,
          dimension["Value"],
          "Dimensions Value",
        ),
      ];
    }),
  );
}
