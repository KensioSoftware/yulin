import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimWafRegularExpressionInput } from "../../regex-pattern-set/sim-waf-regex-pattern-set.js";
import type { SimWafSummaryOutput } from "../web-acl/web-acl.command.js";

/**
 * Minimal structural sim WAFv2 CreateRegexPatternSet command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/wafv2/command/CreateRegexPatternSetCommand/
 */
export interface SimCreateRegexPatternSetCommand {
  readonly input: SimCreateRegexPatternSetCommandInput;
}

export interface SimCreateRegexPatternSetCommandInput {
  readonly Name?: string | undefined;
  readonly Scope?: string | undefined;
  readonly RegularExpressionList?:
    | readonly SimWafRegularExpressionInput[]
    | undefined;
  readonly Description?: string | undefined;
  readonly Tags?: readonly unknown[] | undefined;
}

export interface SimCreateRegexPatternSetCommandOutput {
  readonly Summary?: SimWafSummaryOutput | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim WAFv2 GetRegexPatternSet command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/wafv2/command/GetRegexPatternSetCommand/
 */
export interface SimGetRegexPatternSetCommand {
  readonly input: SimGetRegexPatternSetCommandInput;
}

export interface SimGetRegexPatternSetCommandInput {
  readonly Name?: string | undefined;
  readonly Scope?: string | undefined;
  readonly Id?: string | undefined;
}

/**
 * What GetRegexPatternSet reports about one regex pattern set.
 */
export interface SimWafRegexPatternSetOutput {
  readonly Name: string;
  readonly Id: string;
  readonly ARN: string;
  readonly Description: string | undefined;
  readonly RegularExpressionList: readonly { readonly RegexString: string }[];
}

export interface SimGetRegexPatternSetCommandOutput {
  readonly RegexPatternSet?: SimWafRegexPatternSetOutput | undefined;
  readonly LockToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim WAFv2 ListRegexPatternSets command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/wafv2/command/ListRegexPatternSetsCommand/
 */
export interface SimListRegexPatternSetsCommand {
  readonly input: SimListRegexPatternSetsCommandInput;
}

export interface SimListRegexPatternSetsCommandInput {
  readonly Scope?: string | undefined;
  readonly Limit?: number | undefined;
  readonly NextMarker?: string | undefined;
}

export interface SimListRegexPatternSetsCommandOutput {
  readonly RegexPatternSets?: readonly SimWafSummaryOutput[] | undefined;
  readonly NextMarker?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim WAFv2 DeleteRegexPatternSet command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/wafv2/command/DeleteRegexPatternSetCommand/
 */
export interface SimDeleteRegexPatternSetCommand {
  readonly input: SimDeleteRegexPatternSetCommandInput;
}

export interface SimDeleteRegexPatternSetCommandInput {
  readonly Name?: string | undefined;
  readonly Scope?: string | undefined;
  readonly Id?: string | undefined;
  readonly LockToken?: string | undefined;
}

export interface SimDeleteRegexPatternSetCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
