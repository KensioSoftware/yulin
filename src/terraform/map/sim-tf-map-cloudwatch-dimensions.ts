/*
 * The dimensions an alarm's metric is identified by, which Terraform states as
 * a map and CloudFormation as a list of name and value pairs.
 *
 * Reading a plan means reading records whose keys come from the document
 * rather than from this code, so the object-injection rule fires on every
 * lookup. The records are parsed JSON with no prototype of their own.
 */
// oxlint-disable security/detect-object-injection
import { isRecord } from "../../util/type-guard/record.js";
import type { SimCfnTemplateValue } from "../../service/cloudformation/template/value/sim-cfn-template-value.js";
import { field, type TerraformMappingContext } from "../sim-tf-attributes.js";

/** An alarm's dimensions, and what it could not carry across. */
interface AlarmDimensions {
  readonly value: SimCfnTemplateValue | undefined;
  readonly lost: readonly string[];
}

/**
 * The dimensions the alarm's metric is identified by.
 *
 * Terraform states them as a map and CloudFormation as a list of name and
 * value pairs. A dimension whose value the plan could not resolve is dropped
 * and the map recorded: the references survive, but they survive for the map
 * rather than per key, so which dimension a resolved value belongs to is not
 * in the plan. An alarm carrying a dimension with no value is one PutMetricAlarm
 * refuses.
 */
export function alarmDimensions(
  context: TerraformMappingContext,
): AlarmDimensions {
  const value = field(context.resource.values, "dimensions");

  if (!isRecord(value)) {
    return { value: undefined, lost: [] };
  }

  const entries = Object.entries(value).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  );
  const dropped = entries.length < Object.keys(value).length;

  return {
    value:
      entries.length === 0
        ? undefined
        : entries.map(([Name, Value]) => ({ Name, Value })),
    lost: dropped ? ["dimensions"] : [],
  };
}
