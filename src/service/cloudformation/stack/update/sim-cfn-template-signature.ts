import { jsonStringify } from "../../../../util/type-guard/json.js";
import { isRecord } from "../../../../util/type-guard/record.js";
import type { CfnTemplateBodyRecord } from "../../template/sim-cfn-template.js";
import type { SimCfnTemplateValue } from "../../template/value/sim-cfn-template-value.js";

/**
 * A stable string for a piece of template, for telling one deployment of a
 * Stack apart from the next.
 *
 * A Resource or Output entry is signed after Parameter and intrinsic function
 * resolution, so two signatures differ when the deployed Resource would differ
 * rather than when the template text does. A Parameter given a new value
 * therefore shows up as a change, and a template reformatted without being
 * changed does not.
 *
 * Object keys are sorted so that key order, which CloudFormation does not read
 * anything into, does not read as a change either.
 */
export function simCfnTemplateSignature(
  value:
    | SimCfnTemplateValue
    | readonly SimCfnTemplateValue[]
    | CfnTemplateBodyRecord,
): string {
  return jsonStringify(value, (_key: string, entry: unknown): unknown => {
    if (!isRecord(entry)) {
      return entry;
    }

    return Object.fromEntries(
      Object.entries(entry).toSorted(([left], [right]) =>
        left.localeCompare(right),
      ),
    );
  });
}
