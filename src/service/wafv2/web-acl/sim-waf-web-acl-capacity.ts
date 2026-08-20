import { findSimWafManagedRuleGroup } from "../managed/sim-waf-managed-rule-groups.js";
import type { SimWafStatementInput } from "../statement/sim-waf-statement.type.js";
import type { SimWafRuleInput } from "./sim-waf-rule.type.js";
import { simWafMatchCapacity } from "./sim-waf-statement-capacity.js";

/**
 * What a web ACL's rules add up to in capacity units.
 *
 * The costs are the ones AWS publishes for each statement kind, along with the
 * surcharges for inspecting every query argument and for each text
 * transformation. `sim-waf-statement-capacity.ts` holds them.
 *
 * The sum is an upper bound on what AWS would charge. Real WAF charges a web
 * ACL the sum of its rules minus whatever work it can share between them, and
 * publishes no description of when it shares any. Nothing here enforces the
 * 5,000 unit maximum on a web ACL or the 1,500 units the base price covers.
 */
export function simWafWebAclCapacity(
  rules: readonly SimWafRuleInput[] | undefined,
): number {
  return (rules ?? []).reduce(
    (total, rule) => total + statementCapacity(rule.Statement),
    0,
  );
}

/**
 * What one statement costs, with whatever is nested inside it.
 */
function statementCapacity(
  statement: SimWafStatementInput | undefined,
): number {
  if (statement === undefined) {
    return 0;
  }

  return (
    simWafMatchCapacity(statement) +
    nestedCapacity(statement) +
    managedGroupCapacity(statement)
  );
}

/**
 * What the statements inside a logical statement cost.
 *
 * A logical statement costs what its parts cost and nothing of its own.
 */
function nestedCapacity(statement: SimWafStatementInput): number {
  const joined = [
    ...(statement.AndStatement?.Statements ?? []),
    ...(statement.OrStatement?.Statements ?? []),
  ];

  return (
    joined.reduce((total, nested) => total + statementCapacity(nested), 0) +
    statementCapacity(statement.NotStatement?.Statement)
  );
}

/**
 * What a rule naming a managed rule group costs.
 *
 * A group is fixed at the capacity its owner gave it, and a scope-down
 * statement is charged on top. A group this simulation does not carry
 * contributes nothing, which cannot happen through a compiled web ACL: naming
 * one is refused where the rule is written.
 */
function managedGroupCapacity(statement: SimWafStatementInput): number {
  const named = statement.ManagedRuleGroupStatement;

  if (named === undefined) {
    return 0;
  }

  const group = findSimWafManagedRuleGroup(named.VendorName, named.Name);

  return (group?.capacity ?? 0) + statementCapacity(named.ScopeDownStatement);
}
