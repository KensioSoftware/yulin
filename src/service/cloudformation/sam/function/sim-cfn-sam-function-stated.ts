import type { SimCfnTemplateValueRecord } from "../../template/value/sim-cfn-template-value.js";

/**
 * One member of a SAM record, carried across only where the template states
 * it.
 */
export function stated(
  record: SimCfnTemplateValueRecord,
  name: string,
): SimCfnTemplateValueRecord {
  return Object.fromEntries(
    Object.entries(record).filter(([member]) => member === name),
  );
}
