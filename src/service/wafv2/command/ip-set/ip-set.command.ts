import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimWafSummaryOutput } from "../web-acl/web-acl.command.js";

/**
 * Minimal structural sim WAFv2 CreateIPSet command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/wafv2/command/CreateIPSetCommand/
 */
export interface SimCreateIpSetCommand {
  readonly input: SimCreateIpSetCommandInput;
}

export interface SimCreateIpSetCommandInput {
  readonly Name?: string | undefined;
  readonly Scope?: string | undefined;
  readonly IPAddressVersion?: string | undefined;
  readonly Addresses?: readonly string[] | undefined;
  readonly Description?: string | undefined;
  readonly Tags?: readonly unknown[] | undefined;
}

export interface SimCreateIpSetCommandOutput {
  readonly Summary?: SimWafSummaryOutput | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim WAFv2 GetIPSet command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/wafv2/command/GetIPSetCommand/
 */
export interface SimGetIpSetCommand {
  readonly input: SimGetIpSetCommandInput;
}

export interface SimGetIpSetCommandInput {
  readonly Name?: string | undefined;
  readonly Scope?: string | undefined;
  readonly Id?: string | undefined;
}

/**
 * What GetIPSet reports about one IP set.
 */
export interface SimWafIpSetOutput {
  readonly Name: string;
  readonly Id: string;
  readonly ARN: string;
  readonly Description: string | undefined;
  readonly IPAddressVersion: string;
  readonly Addresses: readonly string[];
}

export interface SimGetIpSetCommandOutput {
  readonly IPSet?: SimWafIpSetOutput | undefined;
  readonly LockToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim WAFv2 UpdateIPSet command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/wafv2/command/UpdateIPSetCommand/
 */
export interface SimUpdateIpSetCommand {
  readonly input: SimUpdateIpSetCommandInput;
}

export interface SimUpdateIpSetCommandInput {
  readonly Name?: string | undefined;
  readonly Scope?: string | undefined;
  readonly Id?: string | undefined;
  readonly Addresses?: readonly string[] | undefined;
  readonly Description?: string | undefined;
  readonly LockToken?: string | undefined;
}

export interface SimUpdateIpSetCommandOutput {
  readonly NextLockToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim WAFv2 ListIPSets command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/wafv2/command/ListIPSetsCommand/
 */
export interface SimListIpSetsCommand {
  readonly input: SimListIpSetsCommandInput;
}

export interface SimListIpSetsCommandInput {
  readonly Scope?: string | undefined;
  readonly Limit?: number | undefined;
  readonly NextMarker?: string | undefined;
}

export interface SimListIpSetsCommandOutput {
  readonly IPSets?: readonly SimWafSummaryOutput[] | undefined;
  readonly NextMarker?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim WAFv2 DeleteIPSet command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/wafv2/command/DeleteIPSetCommand/
 */
export interface SimDeleteIpSetCommand {
  readonly input: SimDeleteIpSetCommandInput;
}

export interface SimDeleteIpSetCommandInput {
  readonly Name?: string | undefined;
  readonly Scope?: string | undefined;
  readonly Id?: string | undefined;
  readonly LockToken?: string | undefined;
}

export interface SimDeleteIpSetCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
