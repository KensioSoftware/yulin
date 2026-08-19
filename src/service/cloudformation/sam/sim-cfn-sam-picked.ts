import type { SimCfnTemplateValueRecord } from "../template/value/sim-cfn-template-value.js";

/**
 * The entries of a record whose keys are in the given set.
 *
 * Every SAM Resource type is expanded by naming the properties that mean the
 * same thing on the Resource it becomes, and carrying those across. Each
 * expansion states one set of names and reaches for this.
 */
export function samPickedProperties(
  record: SimCfnTemplateValueRecord,
  names: ReadonlySet<string>,
): SimCfnTemplateValueRecord {
  return Object.fromEntries(
    Object.entries(record).filter(([name]) => names.has(name)),
  );
}
