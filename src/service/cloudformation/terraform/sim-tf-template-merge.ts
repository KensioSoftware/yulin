/*
 * Reading a plan means reading records whose keys come from the document
 * rather than from this code, so the object-injection rule fires on every
 * lookup. The records are parsed JSON with no prototype of their own.
 */
// oxlint-disable security/detect-object-injection
import { isRecord } from "../../../util/type-guard/record.js";
import type { SimCfnTemplateValueRecord } from "../template/value/sim-cfn-template-value.js";
import type { TerraformResource } from "./sim-tf-plan-resources.js";
import type { TerraformSkippedResource } from "./sim-tf-report.type.js";

/** One resource of the plan recorded as skipped, with the reason it was. */
export function skip(
  resource: TerraformResource,
  reason: TerraformSkippedResource["reason"],
): TerraformSkippedResource {
  return { address: resource.address, type: resource.type, reason };
}

/**
 * A resource template with a fold's properties merged into it.
 *
 * The fold contributes whole CloudFormation properties, so a later fold on the
 * same parent replaces a property an earlier one set rather than merging into
 * it. No two folds of one resource type write the same property.
 */
export function mergedParent(
  parent: SimCfnTemplateValueRecord,
  added: SimCfnTemplateValueRecord,
): SimCfnTemplateValueRecord {
  const existing = parent["Properties"];

  return {
    ...parent,
    Properties: { ...(isRecord(existing) && existing), ...added },
  };
}

/**
 * The logical ID of the resource a fold belongs to.
 *
 * The fold's parent attribute holds a reference rather than a value, because a
 * bucket or a role being created by the same plan has no name until it exists.
 * The reference names the resource directly, which is what a fold needs.
 */
