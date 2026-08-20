import {
  allSimWafManagedRules,
  simWafManagedRuleLabel,
} from "./sim-waf-managed-rule-groups.js";
import type { SimWafManagedRuleTier } from "./sim-waf-managed-rule.type.js";

/**
 * What the simulation covers of one managed rule.
 */
export interface SimWafManagedRuleReport {
  readonly group: string;
  readonly name: string;

  /** The fully qualified label the rule adds to a request it claims. */
  readonly label: string;

  readonly tier: SimWafManagedRuleTier;
}

/**
 * What the simulation covers of every managed rule it carries.
 *
 * This is how a reader finds out what a group does here without reading the
 * source of it, which matters most for the rules that detect less than the AWS
 * rule they stand for.
 */
export function simWafManagedRuleReports(): readonly SimWafManagedRuleReport[] {
  return allSimWafManagedRules().map((entry) => ({
    group: entry.group.name,
    name: entry.rule.name,
    label: simWafManagedRuleLabel(entry),
    tier: entry.rule.tier,
  }));
}
