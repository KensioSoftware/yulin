import type { SimWafMatcher } from "./sim-waf-field-match.js";
import {
  refuseUnsimulatedSimWafRateMembers,
  simWafRateAggregation,
  simWafRateLimit,
  simWafRateWindowMilliseconds,
} from "./sim-waf-rate-based-input.js";
import type { SimWafRateBasedStatementInput } from "./sim-waf-rate-based.type.js";
import { SimWafRateCounter } from "./sim-waf-rate-counter.js";
import {
  compileSimWafStatement,
  type SimWafStatementScope,
} from "./sim-waf-statement.js";

/**
 * Compile a rule that limits how many requests one client may make.
 *
 * The statement counts the requests it sees against the aggregation instance
 * their key selects, and claims a request once the count over the evaluation
 * window has gone past `Limit`. The rule's own action then applies. A blocking
 * rule blocks, and a counting rule records the match and lets the next rule
 * have a look.
 *
 * A scope-down statement decides which requests the rule sees at all. One it
 * leaves alone is neither counted nor limited. That is what keeps a rate limit
 * on `/signup` off the rest of a site.
 *
 * Counting is against the simulated clock. A test that has sent enough
 * requests to trip the rule is served again once time has moved past the
 * window.
 */
export function compileSimWafRateBasedStatement(
  statement: SimWafRateBasedStatementInput,
  scope: SimWafStatementScope,
): SimWafMatcher {
  const { ruleName } = scope;

  refuseUnsimulatedSimWafRateMembers(statement, ruleName);

  const limit = simWafRateLimit(statement, ruleName);
  const keyOf = simWafRateAggregation(statement, ruleName);
  const counter = new SimWafRateCounter({
    clock: scope.clock,
    windowMilliseconds: simWafRateWindowMilliseconds(statement, ruleName),
  });
  const scopeDown =
    statement.ScopeDownStatement === undefined
      ? undefined
      : compileSimWafStatement(statement.ScopeDownStatement, scope);

  return (request): boolean => {
    if (scopeDown !== undefined && !scopeDown(request)) {
      return false;
    }

    return counter.count(keyOf(request)) > limit;
  };
}
