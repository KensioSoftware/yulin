import { SimWafInvalidParameterException } from "../error/sim-wafv2.error.js";
import { SimWafRule } from "./sim-waf-rule.js";
import type { SimWafRuleInput, SimWafRuleScope } from "./sim-waf-rule.type.js";

/**
 * Compile a web ACL's rules into the order they are evaluated in.
 *
 * Rules run in ascending `Priority` rather than in the order they were
 * written, which is the part that surprises people: moving a rule up the list
 * changes nothing, and changing its priority changes everything.
 *
 * Two rules cannot claim one priority, as real WAF requires. Without that,
 * which of them decided a request would come down to how the list happened to
 * be sorted.
 */
export function compileSimWafRules(
  rules: readonly SimWafRuleInput[] | undefined,
  scope: SimWafRuleScope,
): readonly SimWafRule[] {
  const compiled = (rules ?? []).map((rule) => SimWafRule.compile(rule, scope));

  refuseRepeatedPriority(compiled);

  return compiled.toSorted((left, right) => left.priority - right.priority);
}

function refuseRepeatedPriority(rules: readonly SimWafRule[]): void {
  const claimed = new Map<number, string>();

  for (const rule of rules) {
    const already = claimed.get(rule.priority);

    if (already !== undefined) {
      throw new SimWafInvalidParameterException(
        `Error reason: The rules ${already} and ${rule.name} both have ` +
          `priority ${rule.priority}, and a web ACL evaluates its rules in ` +
          `priority order, field: RULE, parameter: ${rule.name}`,
      );
    }

    claimed.set(rule.priority, rule.name);
  }
}
