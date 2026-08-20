import { refuseSimWafRuleInput } from "./sim-waf-rule-refusals.js";
import type { SimWafStatementInput } from "./sim-waf-statement.type.js";

const oneClientAddress =
  "every request in this simulation reports a source address of 127.0.0.1, " +
  "so a rule on where a request came from would see one client for the " +
  "whole simulation";

const undocumentedDetection =
  "AWS does not document the detection it runs, so a simulation of it would " +
  "agree with real WAF by coincidence or not at all";

/**
 * The statement kinds real WAFv2 evaluates and this simulation does not, and
 * why each of them is refused rather than deferred.
 */
const refusedStatements = new Map<string, string>([
  ["IPSetReferenceStatement", oneClientAddress],
  ["GeoMatchStatement", oneClientAddress],
  ["AsnMatchStatement", oneClientAddress],
  ["SqliMatchStatement", undocumentedDetection],
  ["XssMatchStatement", undocumentedDetection],
  [
    "RateBasedStatement",
    "counting requests over a time window against the simulated clock is " +
      "feasible and is not part of this",
  ],
  [
    "RuleGroupReferenceStatement",
    "a rule group is a resource in its own right, and none is simulated",
  ],
]);

/**
 * Refuse a statement kind this simulation cannot evaluate.
 */
export function refuseUnsimulatedSimWafStatement(
  statement: SimWafStatementInput,
  ruleName: string,
): void {
  for (const [kind, value] of Object.entries(statement)) {
    const reason = refusedStatements.get(kind);

    if (reason !== undefined && value !== undefined) {
      refuseSimWafRuleInput(ruleName, `the statement kind ${kind}`, reason);
    }
  }
}
