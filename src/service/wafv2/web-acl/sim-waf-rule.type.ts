import type { SimWafRegexPatternSet } from "../regex-pattern-set/sim-waf-regex-pattern-set.js";
import type { SimWafResourceStore } from "../resource/sim-waf-resource-store.js";
import type { SimWafStatementInput } from "../statement/sim-waf-statement.type.js";
import type { SimWafActionInput } from "./sim-waf-action.type.js";
import type { SimWafCustomResponseBodies } from "./sim-waf-custom-response.type.js";

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
  readonly OverrideAction?: unknown;
  readonly RuleLabels?: readonly unknown[] | undefined;
  readonly CaptchaConfig?: unknown;
  readonly ChallengeConfig?: unknown;
  readonly VisibilityConfig?: unknown;
}

/**
 * What a rule is compiled against.
 */
export interface SimWafRuleScope {
  readonly regexPatternSets: SimWafResourceStore<SimWafRegexPatternSet>;
  readonly customResponseBodies: SimWafCustomResponseBodies;
}
