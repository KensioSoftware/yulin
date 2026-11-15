import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimSsmTag } from "./parameter.command.js";

/**
 * Minimal structural sim SSM AddTagsToResource command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ssm/command/AddTagsToResourceCommand/
 */
export interface SimAddTagsToResourceCommand {
  readonly input: SimAddTagsToResourceCommandInput;
}

export interface SimAddTagsToResourceCommandInput {
  readonly ResourceType?: string | undefined;
  readonly ResourceId?: string | undefined;
  readonly Tags?: readonly SimSsmTag[] | undefined;
}

export interface SimAddTagsToResourceCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim SSM RemoveTagsFromResource command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ssm/command/RemoveTagsFromResourceCommand/
 */
export interface SimRemoveTagsFromResourceCommand {
  readonly input: SimRemoveTagsFromResourceCommandInput;
}

export interface SimRemoveTagsFromResourceCommandInput {
  readonly ResourceType?: string | undefined;
  readonly ResourceId?: string | undefined;
  readonly TagKeys?: readonly string[] | undefined;
}

export interface SimRemoveTagsFromResourceCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim SSM ListTagsForResource command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ssm/command/ListTagsForResourceCommand/
 */
export interface SimSsmListTagsForResourceCommand {
  readonly input: SimSsmListTagsForResourceCommandInput;
}

export interface SimSsmListTagsForResourceCommandInput {
  readonly ResourceType?: string | undefined;
  readonly ResourceId?: string | undefined;
}

export interface SimSsmListTagsForResourceCommandOutput {
  readonly TagList: { Key: string; Value: string }[];
  readonly $metadata: SimResponseMetadata;
}
