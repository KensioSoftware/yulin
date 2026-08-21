/*
 * The object key filter one notification destination is narrowed by.
 *
 * Reading a plan means reading records whose keys come from the document
 * rather than from this code, so the object-injection rule fires on every
 * lookup. The records are parsed JSON with no prototype of their own.
 */
// oxlint-disable security/detect-object-injection
import type { SimCfnTemplateValue } from "../../service/cloudformation/template/value/sim-cfn-template-value.js";
import { field } from "../sim-tf-attributes.js";

/**
 * The object key filter, from the prefix and suffix Terraform states apart.
 *
 * An absent optional string inside a nested block arrives as an empty string
 * rather than as null, and a rule matching the empty prefix matches every
 * object, which is what a filter is written to stop.
 */
export function notificationKeyFilter(
  entry: Record<string, unknown>,
): SimCfnTemplateValue | undefined {
  const rules = [
    { Name: "prefix", Value: notificationText(entry, "filter_prefix") },
    { Name: "suffix", Value: notificationText(entry, "filter_suffix") },
  ].filter(
    (rule): rule is { Name: string; Value: string } => rule.Value !== undefined,
  );

  return rules.length === 0 ? undefined : { Key: { FilterRules: rules } };
}

/** A string field of a block, where the provider wrote anything in it. */
export function notificationText(
  entry: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = field(entry, key);

  return typeof value === "string" && value.length > 0 ? value : undefined;
}
