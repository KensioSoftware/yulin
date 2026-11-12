/**
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/TagResourceCommand/
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/UntagResourceCommand/
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/ListTagsCommand/
 */

import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim Lambda TagResource command.
 */
export interface SimTagResourceCommand {
  readonly input: SimTagResourceCommandInput;
}

/**
 * Minimal structural sim Lambda TagResource input. `Resource` is a function
 * ARN.
 */
export interface SimTagResourceCommandInput {
  readonly Resource?: string | undefined;
  readonly Tags?: Record<string, string> | undefined;
}

/**
 * Minimal structural sim Lambda TagResource output.
 */
export interface SimTagResourceCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Lambda UntagResource command.
 */
export interface SimUntagResourceCommand {
  readonly input: SimUntagResourceCommandInput;
}

/**
 * Minimal structural sim Lambda UntagResource input.
 */
export interface SimUntagResourceCommandInput {
  readonly Resource?: string | undefined;
  readonly TagKeys?: readonly string[] | undefined;
}

/**
 * Minimal structural sim Lambda UntagResource output.
 */
export interface SimUntagResourceCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Lambda ListTags command.
 */
export interface SimListTagsCommand {
  readonly input: SimListTagsCommandInput;
}

/**
 * Minimal structural sim Lambda ListTags input.
 */
export interface SimListTagsCommandInput {
  readonly Resource?: string | undefined;
}

/**
 * Minimal structural sim Lambda ListTags output.
 */
export interface SimListTagsCommandOutput {
  readonly $metadata: SimResponseMetadata;
  readonly Tags: Record<string, string>;
}
