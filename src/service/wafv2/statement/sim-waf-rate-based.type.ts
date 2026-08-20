import type { SimWafStatementInput } from "./sim-waf-statement.type.js";

/**
 * Minimal structural WAFv2 RateBasedStatement.
 *
 * The members Yulin refuses are declared here rather than left out, so a
 * statement that names one is refused by name.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/wafv2/Interface/RateBasedStatement/
 */
export interface SimWafRateBasedStatementInput {
  readonly Limit?: number | undefined;
  readonly EvaluationWindowSec?: number | undefined;
  readonly AggregateKeyType?: string | undefined;
  readonly ScopeDownStatement?: SimWafStatementInput | undefined;
  readonly CustomKeys?: readonly unknown[] | undefined;
  readonly ForwardedIPConfig?: unknown;
}
