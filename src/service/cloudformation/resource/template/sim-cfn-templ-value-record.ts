import { isRecord } from "../../../../util/type-guard/record.js";
import type { SimCfnTemplateValueRecord } from "../../template/value/sim-cfn-template-value.js";

/**
 * Check whether a template value can be read as an object property map.
 *
 * null is excluded by SimCfnTemplateValue's object branch before this helper is
 * called, so the remaining object check only needs to reject arrays.
 */
export function isCfnTemplateValueRecord(
  value: unknown,
): value is SimCfnTemplateValueRecord {
  return isRecord(value);
}
