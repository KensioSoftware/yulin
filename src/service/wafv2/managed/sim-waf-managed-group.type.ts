import type { SimWafStatementInput } from "../statement/sim-waf-statement.type.js";
import type { SimWafActionInput } from "../web-acl/sim-waf-action.type.js";

/**
 * Minimal structural WAFv2 ManagedRuleGroupStatement.
 *
 * The members Yulin refuses are declared here rather than left out, so a
 * statement that names one is refused by name.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/wafv2/Interface/ManagedRuleGroupStatement/
 */
export interface SimWafManagedRuleGroupStatementInput {
  readonly VendorName?: string | undefined;
  readonly Name?: string | undefined;
  readonly Version?: string | undefined;
  readonly ScopeDownStatement?: SimWafStatementInput | undefined;
  readonly RuleActionOverrides?:
    | readonly SimWafRuleActionOverrideInput[]
    | undefined;
  readonly ExcludedRules?: readonly unknown[] | undefined;
  readonly ManagedRuleGroupConfigs?: readonly unknown[] | undefined;
}

/**
 * One rule of a managed group set to an action of the reader's choosing.
 */
export interface SimWafRuleActionOverrideInput {
  readonly Name?: string | undefined;
  readonly ActionToUse?: SimWafActionInput | undefined;
}

/**
 * Minimal structural WAFv2 OverrideAction, which a rule group statement
 * carries in place of an action.
 */
export interface SimWafOverrideActionInput {
  readonly None?: unknown;
  readonly Count?: unknown;
}
