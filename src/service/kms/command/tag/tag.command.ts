import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimKmsTag } from "../../key/sim-kms-key-tags.js";

/**
 * Minimal structural sim KMS TagResource command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/kms/command/TagResourceCommand/
 */
export interface SimKmsTagResourceCommand {
  readonly input: SimKmsTagResourceCommandInput;
}

export interface SimKmsTagResourceCommandInput {
  readonly KeyId?: string | undefined;
  readonly Tags?: readonly SimKmsTag[] | undefined;
}

export interface SimKmsTagResourceCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim KMS UntagResource command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/kms/command/UntagResourceCommand/
 */
export interface SimKmsUntagResourceCommand {
  readonly input: SimKmsUntagResourceCommandInput;
}

export interface SimKmsUntagResourceCommandInput {
  readonly KeyId?: string | undefined;
  readonly TagKeys?: readonly string[] | undefined;
}

export interface SimKmsUntagResourceCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim KMS ListResourceTags command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/kms/command/ListResourceTagsCommand/
 */
export interface SimListResourceTagsCommand {
  readonly input: SimListResourceTagsCommandInput;
}

export interface SimListResourceTagsCommandInput {
  readonly KeyId?: string | undefined;
  readonly Limit?: number | undefined;
  readonly Marker?: string | undefined;
}

export interface SimListResourceTagsCommandOutput {
  readonly Tags: { TagKey: string; TagValue: string }[];
  readonly Truncated: boolean;
  readonly $metadata: SimResponseMetadata;
}
