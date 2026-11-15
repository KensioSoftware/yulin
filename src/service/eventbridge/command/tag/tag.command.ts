import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimEventBridgeTag } from "../bus/bus.command.js";

/**
 * Minimal structural sim EventBridge TagResource command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/eventbridge/command/TagResourceCommand/
 */
export interface SimEventBridgeTagResourceCommand {
  readonly input: SimEventBridgeTagResourceCommandInput;
}

export interface SimEventBridgeTagResourceCommandInput {
  readonly ResourceARN?: string | undefined;
  readonly Tags?: readonly SimEventBridgeTag[] | undefined;
}

export interface SimEventBridgeTagResourceCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim EventBridge UntagResource command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/eventbridge/command/UntagResourceCommand/
 */
export interface SimEventBridgeUntagResourceCommand {
  readonly input: SimEventBridgeUntagResourceCommandInput;
}

export interface SimEventBridgeUntagResourceCommandInput {
  readonly ResourceARN?: string | undefined;
  readonly TagKeys?: readonly string[] | undefined;
}

export interface SimEventBridgeUntagResourceCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim EventBridge ListTagsForResource command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/eventbridge/command/ListTagsForResourceCommand/
 */
export interface SimEventBridgeListTagsForResourceCommand {
  readonly input: SimEventBridgeListTagsForResourceCommandInput;
}

export interface SimEventBridgeListTagsForResourceCommandInput {
  readonly ResourceARN?: string | undefined;
}

export interface SimEventBridgeListTagsForResourceCommandOutput {
  readonly Tags: { Key: string; Value: string }[];
  readonly $metadata: SimResponseMetadata;
}
