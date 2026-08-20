import { SimWafUnsimulatedInputException } from "../error/sim-wafv2.error.js";
import { SimWafRule } from "./sim-waf-rule.js";
import type { SimWafRuleInput, SimWafRuleScope } from "./sim-waf-rule.type.js";

/**
 * One rule of a web ACL this simulation cannot evaluate, and why.
 */
export interface SimWafUnevaluatableRule {
  /** Where the rule sits in the list the web ACL was written with. */
  readonly index: number;

  /** The rule's name, as the reason and a record of it name it. */
  readonly name: string;

  /** What `CreateWebACL` refuses the rule with. */
  readonly reason: string;
}

/**
 * The rules of a web ACL this simulation cannot evaluate.
 *
 * Each rule is compiled on its own and the refusal is caught, so this answers
 * with exactly what `CreateWebACL` would refuse and nothing else. A rule the
 * simulation can evaluate is compiled twice, once here and once by the write
 * that follows, and compiling is a pure reading of the rule.
 *
 * Only a refusal saying the simulation does not go that far is collected. Rule
 * input WAFv2 itself will not take is left where it is, for the write to raise
 * as it always has.
 */
export function unevaluatableSimWafRules(
  rules: readonly SimWafRuleInput[] | undefined,
  scope: SimWafRuleScope,
): readonly SimWafUnevaluatableRule[] {
  return (rules ?? []).flatMap((rule, index) => {
    const reason = unevaluatableReason(rule, scope);

    return reason === undefined
      ? []
      : [{ index, name: rule.Name ?? `at ${index}`, reason }];
  });
}

function unevaluatableReason(
  rule: SimWafRuleInput,
  scope: SimWafRuleScope,
): string | undefined {
  try {
    SimWafRule.compile(rule, scope);
  } catch (error) {
    if (error instanceof SimWafUnsimulatedInputException) {
      return error.message;
    }
  }

  return undefined;
}
