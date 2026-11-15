import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim CloudWatch Logs TagResource command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudwatch-logs/command/TagResourceCommand/
 */
export interface SimLogsTagResourceCommand {
  readonly input: SimLogsTagResourceCommandInput;
}

export interface SimLogsTagResourceCommandInput {
  readonly resourceArn?: string | undefined;
  readonly tags?: Readonly<Record<string, string>> | undefined;
}

export interface SimLogsTagResourceCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim CloudWatch Logs UntagResource command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudwatch-logs/command/UntagResourceCommand/
 */
export interface SimLogsUntagResourceCommand {
  readonly input: SimLogsUntagResourceCommandInput;
}

export interface SimLogsUntagResourceCommandInput {
  readonly resourceArn?: string | undefined;
  readonly tagKeys?: readonly string[] | undefined;
}

export interface SimLogsUntagResourceCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim CloudWatch Logs ListTagsForResource command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudwatch-logs/command/ListTagsForResourceCommand/
 */
export interface SimLogsListTagsForResourceCommand {
  readonly input: SimLogsListTagsForResourceCommandInput;
}

export interface SimLogsListTagsForResourceCommandInput {
  readonly resourceArn?: string | undefined;
}

export interface SimLogsListTagsForResourceCommandOutput {
  readonly tags: Readonly<Record<string, string>>;
  readonly $metadata: SimResponseMetadata;
}
