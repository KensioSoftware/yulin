import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimWafWebAclOutput } from "../web-acl/web-acl.command.js";

/**
 * Minimal structural sim WAFv2 AssociateWebACL command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/wafv2/command/AssociateWebACLCommand/
 */
export interface SimAssociateWebAclCommand {
  readonly input: SimAssociateWebAclCommandInput;
}

export interface SimAssociateWebAclCommandInput {
  readonly WebACLArn?: string | undefined;
  readonly ResourceArn?: string | undefined;
}

export interface SimAssociateWebAclCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim WAFv2 DisassociateWebACL command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/wafv2/command/DisassociateWebACLCommand/
 */
export interface SimDisassociateWebAclCommand {
  readonly input: SimDisassociateWebAclCommandInput;
}

export interface SimDisassociateWebAclCommandInput {
  readonly ResourceArn?: string | undefined;
}

export interface SimDisassociateWebAclCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim WAFv2 GetWebACLForResource command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/wafv2/command/GetWebACLForResourceCommand/
 */
export interface SimGetWebAclForResourceCommand {
  readonly input: SimGetWebAclForResourceCommandInput;
}

export interface SimGetWebAclForResourceCommandInput {
  readonly ResourceArn?: string | undefined;
}

export interface SimGetWebAclForResourceCommandOutput {
  readonly WebACL?: SimWafWebAclOutput | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim WAFv2 ListResourcesForWebACL command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/wafv2/command/ListResourcesForWebACLCommand/
 */
export interface SimListResourcesForWebAclCommand {
  readonly input: SimListResourcesForWebAclCommandInput;
}

export interface SimListResourcesForWebAclCommandInput {
  readonly WebACLArn?: string | undefined;
  readonly ResourceType?: string | undefined;
}

export interface SimListResourcesForWebAclCommandOutput {
  readonly ResourceArns: readonly string[];
  readonly $metadata: SimResponseMetadata;
}
