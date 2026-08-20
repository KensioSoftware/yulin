import type { SimWafManagedRuleGroupStatementInput } from "../managed/sim-waf-managed-group.type.js";
import type { SimWafByteMatchStatementInput } from "./sim-waf-byte-match.js";
import type { SimWafLabelMatchStatementInput } from "./sim-waf-label-match.js";
import type { SimWafFieldToMatchInput } from "./sim-waf-field-to-match.type.js";
import type {
  SimWafRegexMatchStatementInput,
  SimWafRegexPatternSetReferenceInput,
} from "./sim-waf-regex-match.js";
import type { SimWafSizeConstraintStatementInput } from "./sim-waf-size-constraint.js";
import type { SimWafTextTransformationInput } from "./sim-waf-text-transformation.js";

/**
 * What every statement that reads a request field carries.
 */
export interface SimWafFieldStatementInput {
  readonly FieldToMatch?: SimWafFieldToMatchInput | undefined;
  readonly TextTransformations?:
    | readonly SimWafTextTransformationInput[]
    | undefined;
}

/**
 * Minimal structural WAFv2 Statement.
 *
 * The kinds Yulin refuses are declared alongside the ones it evaluates, so a
 * rule that uses one is refused by name rather than read as a rule with no
 * statement in it.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/wafv2/Interface/Statement/
 */
export interface SimWafStatementInput {
  readonly ByteMatchStatement?:
    | (SimWafByteMatchStatementInput & SimWafFieldStatementInput)
    | undefined;
  readonly RegexMatchStatement?:
    | (SimWafRegexMatchStatementInput & SimWafFieldStatementInput)
    | undefined;
  readonly RegexPatternSetReferenceStatement?:
    | (SimWafRegexPatternSetReferenceInput & SimWafFieldStatementInput)
    | undefined;
  readonly SizeConstraintStatement?:
    | (SimWafSizeConstraintStatementInput & SimWafFieldStatementInput)
    | undefined;
  readonly AndStatement?:
    | { readonly Statements?: readonly SimWafStatementInput[] | undefined }
    | undefined;
  readonly OrStatement?:
    | { readonly Statements?: readonly SimWafStatementInput[] | undefined }
    | undefined;
  readonly NotStatement?:
    | { readonly Statement?: SimWafStatementInput | undefined }
    | undefined;
  readonly IPSetReferenceStatement?: unknown;
  readonly GeoMatchStatement?: unknown;
  readonly AsnMatchStatement?: unknown;
  readonly RateBasedStatement?: unknown;
  readonly SqliMatchStatement?: unknown;
  readonly XssMatchStatement?: unknown;
  readonly LabelMatchStatement?: SimWafLabelMatchStatementInput | undefined;
  readonly ManagedRuleGroupStatement?:
    | SimWafManagedRuleGroupStatementInput
    | undefined;
  readonly RuleGroupReferenceStatement?: unknown;
}
