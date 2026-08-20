import { invalidSimWafRule } from "../statement/sim-waf-rule-refusals.js";
import { SimWafAction } from "../web-acl/sim-waf-action.js";
import type { SimWafCustomResponseBodies } from "../web-acl/sim-waf-custom-response.type.js";
import type { SimWafManagedRuleGroupStatementInput } from "./sim-waf-managed-group.type.js";
import { findSimWafManagedRule } from "./sim-waf-managed-rule-groups.js";
import type { SimWafManagedRuleGroupDefinition } from "./sim-waf-managed-rule.type.js";

/**
 * Read the actions a rule group statement sets its named rules to.
 *
 * An override naming a rule the group does not hold is refused. A typo there
 * would otherwise leave the rule it meant to set to `Count` still blocking,
 * which is the failure this whole mechanism exists to avoid.
 */
export function simWafManagedRuleOverrides(
  statement: SimWafManagedRuleGroupStatementInput,
  group: SimWafManagedRuleGroupDefinition,
  ruleName: string,
  bodies: SimWafCustomResponseBodies,
): ReadonlyMap<string, SimWafAction> {
  return new Map(
    (statement.RuleActionOverrides ?? []).map((override) => {
      const overridden = String(override.Name);
      const entry = findSimWafManagedRule(overridden);

      if (entry === undefined || entry.group.name !== group.name) {
        invalidSimWafRule(
          ruleName,
          `The rule group ${group.name} holds no rule named ${overridden} ` +
            `to override`,
        );
      }

      return [
        overridden,
        SimWafAction.read(override.ActionToUse, ruleName, bodies),
      ];
    }),
  );
}
