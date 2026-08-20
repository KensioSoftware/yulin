import type { SimWafAction } from "../web-acl/sim-waf-action.js";
import type { SimWafHeader } from "../web-acl/sim-waf-custom-response.type.js";
import type { SimWafRule } from "../web-acl/sim-waf-rule.js";
import type { SimWafInspectedRequest } from "./sim-waf-inspected-request.js";

/**
 * What a web ACL's rules did with one request.
 *
 * The action is the one that decided the request, and nothing when no rule
 * terminated: the web ACL's default action decides then, and that belongs to
 * the web ACL rather than to its rules.
 */
export interface SimWafRuleOutcome {
  readonly action: SimWafAction | undefined;
  readonly terminatingRuleName: string | undefined;
  readonly countedRuleNames: readonly string[];
  readonly insertedHeaders: readonly SimWafHeader[];
}

/**
 * Run a web ACL's rules over one request.
 *
 * The rules are already in ascending priority, and the first of them that
 * matches with a terminating action decides the request. A `Count` action
 * records the match and lets the next rule have a look, which is why this
 * carries on past a match rather than answering with the first one.
 */
export function simWafEvaluateRules(
  rules: readonly SimWafRule[],
  request: SimWafInspectedRequest,
): SimWafRuleOutcome {
  const countedRuleNames: string[] = [];
  const insertedHeaders: SimWafHeader[] = [];

  for (const rule of rules) {
    const action = rule.evaluate(request);

    if (action === undefined) {
      continue;
    }

    insertedHeaders.push(...action.insertHeaders);

    if (action.isTerminating) {
      return {
        action,
        terminatingRuleName: rule.name,
        countedRuleNames,
        insertedHeaders,
      };
    }

    countedRuleNames.push(rule.name);
  }

  return {
    action: undefined,
    terminatingRuleName: undefined,
    countedRuleNames,
    insertedHeaders,
  };
}
