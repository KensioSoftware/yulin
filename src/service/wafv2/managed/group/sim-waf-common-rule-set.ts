import type { SimWafManagedRuleGroupDefinition } from "../sim-waf-managed-rule.type.js";
import { simWafCorePayloadRules } from "./sim-waf-core-payload-rules.js";
import { simWafCoreRequestRules } from "./sim-waf-core-request-rules.js";

/**
 * The AWS core rule set, in the order AWS evaluates its rules.
 *
 * This is the group a team turning WAF on nearly always turns on, which is why
 * it is here. Every rule blocks by default.
 *
 * The order matters as much as the rules do. Two rules can claim one request,
 * and the first of them to claim it is the one that blocks it and the one
 * whose label the request carries, so a rule moved up or down would change
 * which of them a test sees. The rules are held in two lists, and the join
 * between them is where AWS's own order goes from reading the request to
 * looking inside it.
 */
export const simWafCommonRuleSet: SimWafManagedRuleGroupDefinition = {
  name: "AWSManagedRulesCommonRuleSet",
  labelNamespace: "awswaf:managed:aws:core-rule-set",
  capacity: 700,
  rules: [...simWafCoreRequestRules, ...simWafCorePayloadRules],
};
