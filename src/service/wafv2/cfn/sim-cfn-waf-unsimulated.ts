import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimWafResource } from "../resource/sim-waf-resource.js";

/**
 * Record on a Resource each part of the WAFv2 resource it created that the
 * simulation holds and does not act on.
 *
 * The path is the one `unsimulatedParts` reports, so `stack.ignoredProperties`
 * and an SDK caller read the same names.
 */
export function simCfnWafRecordUnsimulated(
  resource: SimCfnResource,
  created: SimWafResource,
): void {
  for (const { part, reason } of created.unsimulated) {
    resource.ignoreProperty(part, reason);
  }
}
