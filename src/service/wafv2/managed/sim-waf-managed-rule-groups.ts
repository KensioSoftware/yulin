import { simWafAdminProtectionRuleSet } from "./group/sim-waf-admin-protection.js";
import { simWafCommonRuleSet } from "./group/sim-waf-common-rule-set.js";
import { simWafKnownBadInputsRuleSet } from "./group/sim-waf-known-bad-inputs.js";
import type {
  SimWafManagedRuleDefinition,
  SimWafManagedRuleGroupDefinition,
} from "./sim-waf-managed-rule.type.js";

/**
 * The vendor the simulated managed rule groups belong to.
 *
 * A group from any other vendor is refused, marketplace groups included: a
 * subscription buys rules nobody outside the vendor has ever seen.
 */
export const simWafManagedVendorName = "AWS";

const groups: readonly SimWafManagedRuleGroupDefinition[] = [
  simWafCommonRuleSet,
  simWafKnownBadInputsRuleSet,
  simWafAdminProtectionRuleSet,
];

const byName = new Map(groups.map((group) => [group.name, group]));

/**
 * One rule and the group it belongs to.
 */
export interface SimWafManagedRuleEntry {
  readonly group: SimWafManagedRuleGroupDefinition;
  readonly rule: SimWafManagedRuleDefinition;
}

const rulesByName = new Map<string, SimWafManagedRuleEntry>(
  groups.flatMap((group) =>
    group.rules.map((rule) => [rule.name, { group, rule }] as const),
  ),
);

/**
 * Find a simulated managed rule group by vendor and name.
 */
export function findSimWafManagedRuleGroup(
  vendorName: string | undefined,
  name: string | undefined,
): SimWafManagedRuleGroupDefinition | undefined {
  return vendorName === simWafManagedVendorName && name !== undefined
    ? byName.get(name)
    : undefined;
}

/**
 * The groups that are simulated, named as a refusal names them.
 */
export function simWafManagedRuleGroupNames(): readonly string[] {
  return groups.map((group) => group.name);
}

/**
 * Find one managed rule by name, wherever it lives.
 *
 * Rule names are unique across the simulated groups, which is what lets a
 * declared match and an action override name a rule and nothing else.
 */
export function findSimWafManagedRule(
  name: string,
): SimWafManagedRuleEntry | undefined {
  return rulesByName.get(name);
}

/**
 * Every rule of every simulated group, in the order the groups evaluate them.
 */
export function allSimWafManagedRules(): readonly SimWafManagedRuleEntry[] {
  return rulesByName.values().toArray();
}

/**
 * The fully qualified name of the label one rule adds.
 */
export function simWafManagedRuleLabel(entry: SimWafManagedRuleEntry): string {
  return `${entry.group.labelNamespace}:${entry.rule.label}`;
}
