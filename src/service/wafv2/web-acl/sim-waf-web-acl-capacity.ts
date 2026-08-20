import { findSimWafManagedRuleGroup } from "../managed/sim-waf-managed-rule-groups.js";
import type { SimWafStatementInput } from "../statement/sim-waf-statement.type.js";
import type { SimWafRuleInput } from "./sim-waf-rule.type.js";

/**
 * The web ACL capacity units AWS charges for each statement kind.
 *
 * Only the kinds this simulation evaluates are listed. Every other kind is
 * refused where the rule is written, so a web ACL that has rules to add up
 * cannot hold one. The costs are AWS's published base costs, which is the
 * whole of the sum here: the surcharges for text transformations and for
 * inspecting a JSON body are left out, so a web ACL's capacity reads low
 * against the same rules on AWS.
 *
 * Nothing enforces the 1,500 unit limit on a web ACL. The number exists
 * because `Fn::GetAtt` on `Capacity` asks for one, and a template that outputs
 * it or writes it into an alarm deploys rather than failing on an attribute
 * with nothing behind it.
 */
const statementCosts: ReadonlyMap<string, number> = new Map([
  ["ByteMatchStatement", 1],
  ["RegexMatchStatement", 3],
  ["RegexPatternSetReferenceStatement", 25],
  ["SizeConstraintStatement", 1],
  ["LabelMatchStatement", 1],
]);

/**
 * What a web ACL's rules add up to in capacity units.
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
 *
 * A logical statement costs what its parts cost and nothing of its own, and a
 * rule group costs the group's fixed capacity plus its scope-down statement.
 */
function statementCapacity(
  statement: SimWafStatementInput | undefined,
): number {
  if (statement === undefined) {
    return 0;
  }

  return (
    ownCapacity(statement) +
    nestedCapacity(statement) +
    managedGroupCapacity(statement)
  );
}

/**
 * What a statement costs before anything nested in it is counted.
 */
function ownCapacity(statement: SimWafStatementInput): number {
  let total = 0;

  for (const [kind, value] of Object.entries(statement)) {
    if (value !== undefined) {
      total += statementCosts.get(kind) ?? 0;
    }
  }

  return total;
}

/**
 * What the statements inside a logical statement cost.
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
 * A group this simulation does not carry contributes nothing, which cannot
 * happen through a compiled web ACL: naming one is refused where the rule is
 * written.
 */
function managedGroupCapacity(statement: SimWafStatementInput): number {
  const named = statement.ManagedRuleGroupStatement;

  if (named === undefined) {
    return 0;
  }

  const group = findSimWafManagedRuleGroup(named.VendorName, named.Name);

  return (group?.capacity ?? 0) + statementCapacity(named.ScopeDownStatement);
}
