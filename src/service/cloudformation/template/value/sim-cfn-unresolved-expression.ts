import { isRecord } from "../../../../util/type-guard/record.js";
import type { SimCfnTemplateValue } from "./sim-cfn-template-value.js";

/**
 * Whether a resolved value is still an unresolved intrinsic expression.
 *
 * Resolution runs in two phases, so a node can resolve to a `Ref` or an
 * `Fn::*` object that a later phase finishes. A function reading that value
 * has to tell it apart from a value the template really carries: an object
 * with one intrinsic key is deferred work, anything else is the wrong type.
 */
export function isSimCfnUnresolvedExpression(
  value: SimCfnTemplateValue,
): value is Record<string, SimCfnTemplateValue> {
  if (!isRecord(value)) {
    return false;
  }

  const entries = Object.entries(value);

  if (entries.length !== 1) {
    return false;
  }

  const functionName = entries[0]?.[0];

  return functionName === "Ref" || functionName?.startsWith("Fn::") === true;
}
