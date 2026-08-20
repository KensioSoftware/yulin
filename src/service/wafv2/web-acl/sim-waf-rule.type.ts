import type { SimWafOverrideActionInput } from "../managed/sim-waf-managed-group.type.js";
import type { SimWafManagedRules } from "../managed/sim-waf-managed-rules.js";
import type { SimWafRegexPatternSet } from "../regex-pattern-set/sim-waf-regex-pattern-set.js";
import type { SimWafResourceStore } from "../resource/sim-waf-resource-store.js";
import type { SimWafInspectedRequest } from "../evaluate/sim-waf-inspected-request.js";
import type { SimWafStatementInput } from "../statement/sim-waf-statement.type.js";
import type { SimWafAction } from "./sim-waf-action.js";
import type { SimWafActionInput } from "./sim-waf-action.type.js";
import type { SimWafCustomResponseBodies } from "./sim-waf-custom-response.type.js";
import type { SimWafLabelInput } from "./sim-waf-rule-labels.js";

/**
 * Minimal structural WAFv2 Rule.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/wafv2/Interface/Rule/
 */
export interface SimWafRuleInput {
  readonly Name?: string | undefined;
  readonly Priority?: number | undefined;
  readonly Statement?: SimWafStatementInput | undefined;
  readonly Action?: SimWafActionInput | undefined;
  readonly OverrideAction?: SimWafOverrideActionInput | undefined;
  readonly RuleLabels?: readonly SimWafLabelInput[] | undefined;
  readonly CaptchaConfig?: unknown;
  readonly ChallengeConfig?: unknown;
  readonly VisibilityConfig?: unknown;
}

/**
 * What a web ACL brings to compiling its rules, which is everything a rule is
 * compiled against bar the custom responses it was written with.
 */
export interface SimWafWebAclRuleScope {
  readonly regexPatternSets: SimWafResourceStore<SimWafRegexPatternSet>;
  readonly managedRules: SimWafManagedRules;
}

/**
 * What a rule is compiled against.
 */
export interface SimWafRuleScope extends SimWafWebAclRuleScope {
  readonly customResponseBodies: SimWafCustomResponseBodies;
}

/**
 * What one compiled rule does with a request.
 *
 * A rule that claims the request answers with the action to apply, and one
 * that does not answers with nothing. The action is not the rule's own for
 * every rule: a rule naming a managed rule group answers with the action of
 * whichever rule inside the group claimed the request.
 */
export type SimWafRuleEvaluator = (
  request: SimWafInspectedRequest,
) => SimWafAction | undefined;
