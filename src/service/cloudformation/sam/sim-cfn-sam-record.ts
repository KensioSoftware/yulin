import { isRecord } from "../../../util/type-guard/record.js";
import type { SimCfnTemplateValueRecord } from "../template/value/sim-cfn-template-value.js";

/**
 * Whether a template value is an object, and so something the expansion can
 * read properties off.
 *
 * A SAM template is written by hand more often than a CloudFormation one is,
 * and the expansion reads what it finds. A property in the wrong shape is left
 * for the Resource it expands into to refuse, where the diagnostic names the
 * Resource type and the property.
 */
export function isSamTemplateRecord(
  value: unknown,
): value is SimCfnTemplateValueRecord {
  return isRecord(value);
}
