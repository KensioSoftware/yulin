import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import {
  metricFilterList,
  metricFilterPropertyError,
  metricFilterRecord,
  metricFilterRequiredString,
} from "./sim-cfn-metric-filter-value.js";

/**
 * Read a transformation's dimensions into the map shape the API uses.
 *
 * The template carries them as a list of Key and Value pairs, and the SDK
 * carries the same thing as a map, so both routes reach one implementation.
 * An empty list is refused, because CloudFormation takes one to three entries.
 */
export function simCfnMetricDimensions(
  logicalId: string,
  value: SimCfnTemplateValue | undefined,
): Readonly<Record<string, string>> | undefined {
  if (value === undefined) {
    return undefined;
  }

  const listed = metricFilterList(logicalId, value, "Dimensions");

  if (listed.length === 0) {
    throw metricFilterPropertyError(
      logicalId,
      "MetricTransformations Dimensions must have at least one entry",
    );
  }

  return Object.fromEntries(listed.map((entry) => pair(logicalId, entry)));
}

function pair(
  logicalId: string,
  entry: SimCfnTemplateValue,
): readonly [string, string] {
  const dimension = metricFilterRecord(logicalId, entry, "Dimensions entry");

  return [
    metricFilterRequiredString(logicalId, dimension["Key"], "Dimensions Key"),
    metricFilterRequiredString(
      logicalId,
      dimension["Value"],
      "Dimensions Value",
    ),
  ];
}
