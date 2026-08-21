/*
 * Reading a plan means reading records whose keys come from the document
 * rather than from this code, so the object-injection rule fires on every
 * lookup. The records are parsed JSON with no prototype of their own.
 */
// oxlint-disable security/detect-object-injection
import { isRecord } from "../../../util/type-guard/record.js";
import type { SimCfnTemplateValue } from "../template/value/sim-cfn-template-value.js";

/**
 * The logical IDs an intrinsic somewhere in this value names.
 *
 * A `Ref` names one in its value and an `Fn::GetAtt` names one in the first
 * element of its list. Anything else is walked into, because an intrinsic can
 * sit at any depth of a property.
 */
export function referencedLogicalIds(
  value: SimCfnTemplateValue | undefined,
): readonly string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => referencedLogicalIds(entry));
  }

  if (!isRecord(value)) {
    return [];
  }

  const named = intrinsicTarget(value);

  if (named !== undefined) {
    return [named];
  }

  return Object.values(value).flatMap((nested) => referencedLogicalIds(nested));
}

function intrinsicTarget(value: Record<string, unknown>): string | undefined {
  const referenced = value["Ref"];

  if (typeof referenced === "string") {
    return referenced;
  }

  const attribute = value["Fn::GetAtt"];

  if (Array.isArray(attribute) && typeof attribute[0] === "string") {
    return attribute[0];
  }

  return undefined;
}
