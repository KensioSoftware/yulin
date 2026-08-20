import { compileSimWafStatement } from "../statement/sim-waf-statement.js";
import { SimWafAction } from "../web-acl/sim-waf-action.js";
import type {
  SimWafRuleEvaluator,
  SimWafRuleScope,
} from "../web-acl/sim-waf-rule.type.js";
import {
  requiredSimWafManagedRuleGroup,
  simWafGroupCountsEverything,
} from "./sim-waf-managed-group-input.js";
import { simWafManagedRuleOverrides } from "./sim-waf-managed-rule-overrides.js";
import type {
  SimWafManagedRuleGroupStatementInput,
  SimWafOverrideActionInput,
} from "./sim-waf-managed-group.type.js";
import { simWafManagedRequestParts } from "./sim-waf-managed-request.js";

interface SimWafManagedRuleGroupProperties {
  readonly statement: SimWafManagedRuleGroupStatementInput;
  readonly overrideAction: SimWafOverrideActionInput | undefined;
  readonly ruleName: string;
  readonly scope: SimWafRuleScope;
}

/**
 * Compile a rule that names an AWS managed rule group.
 *
 * The group's rules run in the order AWS evaluates them, and the first of them
 * whose action terminates decides the request. A rule that matches adds its
 * label whatever action it ends up taking, which is what lets the tuning
 * pattern work: the group runs in count mode, labels what it would have
 * blocked, and a rule of the reader's own blocks on the label.
 *
 * The two overrides stack in one direction. `RuleActionOverrides` sets what a
 * named rule does, and a group override action of `Count` then holds the whole
 * group to counting whatever its rules were set to, so an overridden group
 * cannot decide a request.
 */
export function compileSimWafManagedRuleGroup(
  properties: SimWafManagedRuleGroupProperties,
): SimWafRuleEvaluator {
  const { statement, ruleName, scope } = properties;
  const group = requiredSimWafManagedRuleGroup(statement, ruleName);
  const overrides = simWafManagedRuleOverrides(
    statement,
    group,
    ruleName,
    scope.customResponseBodies,
  );
  const counting = simWafGroupCountsEverything(
    properties.overrideAction,
    ruleName,
  );
  const scopeDown =
    statement.ScopeDownStatement === undefined
      ? undefined
      : compileSimWafStatement(statement.ScopeDownStatement, {
          regexPatternSets: scope.regexPatternSets,
          ruleName,
        });

  // Every rule in the three simulated groups blocks by default, and a group
  // that is counting counts whatever the rule that matched was set to.
  const blocking = SimWafAction.read({ Block: {} }, ruleName, {});
  const counted = SimWafAction.read({ Count: {} }, ruleName, {});
  const { managedRules } = scope;

  return (request): SimWafAction | undefined => {
    // A scope-down statement decides whether the group sees the request at
    // all, so a request it does not claim picks up no label from the group.
    if (scopeDown !== undefined && !scopeDown(request)) {
      return undefined;
    }

    const parts = simWafManagedRequestParts(request);
    const declared = managedRules.declaredMatches(request);
    let matched = false;

    for (const rule of group.rules) {
      if (!declared.has(rule.name) && rule.detects?.(parts) !== true) {
        continue;
      }

      request.labels.add(`${group.labelNamespace}:${rule.label}`);

      const action = counting
        ? counted
        : (overrides.get(rule.name) ?? blocking);

      if (action.isTerminating) {
        return action;
      }

      matched = true;
    }

    return matched ? counted : undefined;
  };
}
