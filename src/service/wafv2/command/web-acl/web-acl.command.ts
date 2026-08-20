import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimWafActionInput } from "../../web-acl/sim-waf-action.type.js";
import type { SimWafCustomResponseBodies } from "../../web-acl/sim-waf-custom-response.type.js";
import type { SimWafRuleInput } from "../../web-acl/sim-waf-rule.type.js";

/**
 * What a listing reports about one web ACL, IP set or regex pattern set.
 */
export interface SimWafSummaryOutput {
  readonly Name: string;
  readonly Id: string;
  readonly Description: string | undefined;
  readonly LockToken: string;
  readonly ARN: string;
}

/**
 * What a web ACL is written with, shared by CreateWebACL and UpdateWebACL.
 */
export interface SimWafWebAclWriteInput {
  readonly Name?: string | undefined;
  readonly Scope?: string | undefined;
  readonly DefaultAction?: SimWafActionInput | undefined;
  readonly Description?: string | undefined;
  readonly Rules?: readonly SimWafRuleInput[] | undefined;
  readonly VisibilityConfig?: unknown;
  readonly CustomResponseBodies?: SimWafCustomResponseBodies | undefined;
  readonly Tags?: readonly unknown[] | undefined;
  readonly CaptchaConfig?: unknown;
  readonly ChallengeConfig?: unknown;
  readonly TokenDomains?: readonly string[] | undefined;
  readonly AssociationConfig?: unknown;
  readonly DataProtectionConfig?: unknown;
  readonly OnSourceDDoSProtectionConfig?: unknown;
  readonly ApplicationConfig?: unknown;
}

/**
 * Minimal structural sim WAFv2 CreateWebACL command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/wafv2/command/CreateWebACLCommand/
 */
export interface SimCreateWebAclCommand {
  readonly input: SimCreateWebAclCommandInput;
}

export type SimCreateWebAclCommandInput = SimWafWebAclWriteInput;

export interface SimCreateWebAclCommandOutput {
  readonly Summary?: SimWafSummaryOutput | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim WAFv2 GetWebACL command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/wafv2/command/GetWebACLCommand/
 */
export interface SimGetWebAclCommand {
  readonly input: SimGetWebAclCommandInput;
}

export interface SimGetWebAclCommandInput {
  readonly Name?: string | undefined;
  readonly Scope?: string | undefined;
  readonly Id?: string | undefined;
}

/**
 * What GetWebACL reports about one web ACL.
 */
export interface SimWafWebAclOutput {
  readonly Name: string;
  readonly Id: string;
  readonly ARN: string;
  readonly Capacity: number;
  readonly LabelNamespace: string;
  readonly Description: string | undefined;
  readonly DefaultAction: SimWafActionInput | undefined;
  readonly Rules: readonly SimWafRuleInput[];
  readonly VisibilityConfig: unknown;
  readonly CustomResponseBodies: SimWafCustomResponseBodies | undefined;
}

export interface SimGetWebAclCommandOutput {
  readonly WebACL?: SimWafWebAclOutput | undefined;
  readonly LockToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim WAFv2 UpdateWebACL command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/wafv2/command/UpdateWebACLCommand/
 */
export interface SimUpdateWebAclCommand {
  readonly input: SimUpdateWebAclCommandInput;
}

export interface SimUpdateWebAclCommandInput extends SimWafWebAclWriteInput {
  readonly Id?: string | undefined;
  readonly LockToken?: string | undefined;
}

export interface SimUpdateWebAclCommandOutput {
  readonly NextLockToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim WAFv2 ListWebACLs command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/wafv2/command/ListWebACLsCommand/
 */
export interface SimListWebAclsCommand {
  readonly input: SimListWebAclsCommandInput;
}

export interface SimListWebAclsCommandInput {
  readonly Scope?: string | undefined;
  readonly Limit?: number | undefined;
  readonly NextMarker?: string | undefined;
}

export interface SimListWebAclsCommandOutput {
  readonly WebACLs?: readonly SimWafSummaryOutput[] | undefined;
  readonly NextMarker?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim WAFv2 DeleteWebACL command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/wafv2/command/DeleteWebACLCommand/
 */
export interface SimDeleteWebAclCommand {
  readonly input: SimDeleteWebAclCommandInput;
}

export interface SimDeleteWebAclCommandInput {
  readonly Name?: string | undefined;
  readonly Scope?: string | undefined;
  readonly Id?: string | undefined;
  readonly LockToken?: string | undefined;
}

export interface SimDeleteWebAclCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
