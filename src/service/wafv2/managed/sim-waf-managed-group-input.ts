import {
  invalidSimWafRule,
  refuseSimWafRuleInput,
} from "../statement/sim-waf-rule-refusals.js";
import type {
  SimWafManagedRuleGroupStatementInput,
  SimWafOverrideActionInput,
} from "./sim-waf-managed-group.type.js";
import {
  findSimWafManagedRuleGroup,
  simWafManagedRuleGroupNames,
} from "./sim-waf-managed-rule-groups.js";
import type { SimWafManagedRuleGroupDefinition } from "./sim-waf-managed-rule.type.js";

/**
 * The rule group statement members real WAFv2 takes and this simulation does
 * not.
 */
const refusedMembers = new Map<string, string>([
  [
    "Version",
    "a versioned rule group is a snapshot of rules that were published on a " +
      "date, and only the current rules are carried here",
  ],
  [
    "ExcludedRules",
    "AWS replaced it with RuleActionOverrides, which says which action a " +
      "named rule takes rather than only that it takes none",
  ],
  [
    "ManagedRuleGroupConfigs",
    "it configures the Bot Control, account takeover and account creation " +
      "groups, and none of those is simulated",
  ],
]);

/**
 * Find the simulated group a statement names, refusing any other.
 *
 * The refusal names the groups that are simulated, because the ones that are
 * not are left out for reasons a reader cannot guess from the name: a group
 * that decides by caller address sees one client for the whole simulation, and
 * a group whose detection AWS does not describe cannot be reproduced at all.
 */
export function requiredSimWafManagedRuleGroup(
  statement: SimWafManagedRuleGroupStatementInput,
  ruleName: string,
): SimWafManagedRuleGroupDefinition {
  for (const [member, value] of Object.entries(statement)) {
    const reason = refusedMembers.get(member);

    if (reason !== undefined && value !== undefined) {
      refuseSimWafRuleInput(
        ruleName,
        `the rule group member ${member}`,
        reason,
      );
    }
  }

  const group = findSimWafManagedRuleGroup(
    statement.VendorName,
    statement.Name,
  );

  if (group === undefined) {
    const named = `${String(statement.VendorName)} ${String(statement.Name)}`;
    const simulated = simWafManagedRuleGroupNames().join(", ");

    refuseSimWafRuleInput(
      ruleName,
      `the managed rule group ${named}`,
      `the simulated groups are ${simulated}`,
    );
  }

  return group;
}

/**
 * Whether a rule group's own override action turns the whole group to counting.
 *
 * `None` and `Count` are the two real WAFv2 takes, and one of them is required
 * on a rule that names a rule group. A rule with neither would be a rule with
 * no action at all, since a rule group statement carries no `Action`.
 */
export function simWafGroupCountsEverything(
  overrideAction: SimWafOverrideActionInput | undefined,
  ruleName: string,
): boolean {
  if (overrideAction?.Count !== undefined) {
    return true;
  }

  if (overrideAction?.None === undefined) {
    invalidSimWafRule(
      ruleName,
      "A rule naming a rule group takes an OverrideAction of None or Count " +
        "in place of an Action",
    );
  }

  return false;
}
