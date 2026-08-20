import type { SimWafMatcher } from "./sim-waf-field-match.js";
import { invalidSimWafRule } from "./sim-waf-rule-refusals.js";

/**
 * Minimal structural WAFv2 LabelMatchStatement.
 */
export interface SimWafLabelMatchStatementInput {
  readonly Scope?: string | undefined;
  readonly Key?: string | undefined;
}

/**
 * Build the matcher for a statement that reads the labels a request picked up.
 *
 * The labels come from the rules that already ran, so a label match reads what
 * the rules at lower priorities left behind. That is the whole of the pattern
 * teams tune a managed rule group with: run the group in count mode, and block
 * on the label of the one rule in it that matters.
 *
 * A `LABEL` scope matches the fully qualified name of one label, and a
 * `NAMESPACE` scope matches every label under a prefix, so one rule can block
 * on anything the core rule set claimed.
 */
export function compileSimWafLabelMatch(
  statement: SimWafLabelMatchStatementInput,
  ruleName: string,
): SimWafMatcher {
  const { Key: key, Scope: scope } = statement;

  if (key === undefined || key === "") {
    invalidSimWafRule(ruleName, "A LabelMatchStatement needs a Key to match");
  }

  if (scope === "LABEL") {
    return (request): boolean => request.labels.has(key);
  }

  if (scope === "NAMESPACE") {
    return (request): boolean => request.labels.hasNamespace(key);
  }

  invalidSimWafRule(
    ruleName,
    `The label match scope ${String(scope)} is LABEL or NAMESPACE`,
  );
}
