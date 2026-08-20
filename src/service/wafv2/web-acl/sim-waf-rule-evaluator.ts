import { compileSimWafManagedRuleGroup } from "../managed/sim-waf-managed-group-statement.js";
import type { SimWafMatcher } from "../statement/sim-waf-field-match.js";
import { refuseJoinedSimWafRateBased } from "../statement/sim-waf-rate-based-input.js";
import { compileSimWafRateBasedStatement } from "../statement/sim-waf-rate-based.js";
import { invalidSimWafRule } from "../statement/sim-waf-rule-refusals.js";
import {
  compileSimWafStatement,
  type SimWafStatementScope,
} from "../statement/sim-waf-statement.js";
import type { SimWafStatementInput } from "../statement/sim-waf-statement.type.js";
import { SimWafAction } from "./sim-waf-action.js";
import type {
  SimWafRuleEvaluator,
  SimWafRuleInput,
  SimWafRuleScope,
} from "./sim-waf-rule.type.js";

/**
 * Compile what one rule does with a request.
 *
 * A rule naming a managed rule group is the one rule that decides by something
 * other than its own action, so it is the one branch here. Real WAFv2 draws
 * the same line: a rule carries an `Action` or it names a rule group and
 * carries an `OverrideAction`, and never both.
 */
export function compileSimWafRuleEvaluator(
  input: SimWafRuleInput,
  ruleName: string,
  scope: SimWafRuleScope,
): SimWafRuleEvaluator {
  const managed = input.Statement?.ManagedRuleGroupStatement;

  if (managed !== undefined) {
    if (input.Action !== undefined) {
      invalidSimWafRule(
        ruleName,
        "A rule naming a rule group takes an OverrideAction rather than an " +
          "Action, since the action comes from the rule inside the group " +
          "that claimed the request",
      );
    }

    return compileSimWafManagedRuleGroup({
      statement: managed,
      overrideAction: input.OverrideAction,
      ruleName,
      scope,
    });
  }

  if (input.OverrideAction !== undefined) {
    invalidSimWafRule(
      ruleName,
      "An OverrideAction applies to a rule group statement, and this rule " +
        "names no rule group",
    );
  }

  const action = SimWafAction.read(
    input.Action,
    ruleName,
    scope.customResponseBodies,
  );
  const matches = compileRuleStatement(input.Statement, {
    regexPatternSets: scope.regexPatternSets,
    clock: scope.clock,
    ruleName,
  });

  return (request): SimWafAction | undefined =>
    matches(request) ? action : undefined;
}

/**
 * Compile the statement a rule carries.
 *
 * A `RateBasedStatement` is compiled here rather than wherever a statement is
 * met, because it is the whole of a rule's statement on real WAFv2 and holds
 * the counts that rule has taken. Being the whole of it is checked here too,
 * since dispatching on the member would otherwise read past a statement kind
 * written beside it. Nesting one is refused where the nesting would have
 * happened.
 */
function compileRuleStatement(
  statement: SimWafStatementInput | undefined,
  scope: SimWafStatementScope,
): SimWafMatcher {
  if (statement === undefined) {
    return compileSimWafStatement(statement, scope);
  }

  refuseJoinedSimWafRateBased(statement, scope.ruleName);

  const rateBased = statement.RateBasedStatement;

  return rateBased === undefined
    ? compileSimWafStatement(statement, scope)
    : compileSimWafRateBasedStatement(rateBased, scope);
}
