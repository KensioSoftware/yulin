import { invalidSimWafRule } from "../statement/sim-waf-rule-refusals.js";

/**
 * Minimal structural WAFv2 Label, which a rule adds to a request it matches.
 */
export interface SimWafLabelInput {
  readonly Name?: string | undefined;
}

/**
 * Read the labels a rule adds to the requests it claims.
 *
 * A label a rule of the web ACL's own adds carries no prefix, where a label
 * from a rule group is qualified by the group it came from. That is AWS's own
 * rule, and it is what a `LabelMatchStatement` key has to be written to match.
 */
export function simWafRuleLabels(
  labels: readonly SimWafLabelInput[] | undefined,
  ruleName: string,
): readonly string[] {
  return (labels ?? []).map((label) => {
    if (label.Name === undefined || label.Name === "") {
      invalidSimWafRule(ruleName, "A rule label needs a Name");
    }

    return label.Name;
  });
}
