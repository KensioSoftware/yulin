import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimSnsTopicAttributeInput } from "../../topic/sim-sns-topic-attributes.js";

/**
 * One topic in a ListTopics response, which carries the ARN and nothing else.
 */
export interface SimSnsListedTopic {
  readonly TopicArn: string;
}

/**
 * Minimal structural sim SNS CreateTopic command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sns/command/CreateTopicCommand/
 */
export interface SimCreateTopicCommand {
  readonly input: SimCreateTopicCommandInput;
}

export interface SimCreateTopicCommandInput {
  readonly Name?: string | undefined;
  readonly Attributes?: SimSnsTopicAttributeInput | undefined;
  readonly Tags?: readonly SimSnsTag[] | undefined;
  readonly DataProtectionPolicy?: string | undefined;
}

/**
 * One tag as a CreateTopic request carries it.
 */
export interface SimSnsTag {
  readonly Key?: string | undefined;
  readonly Value?: string | undefined;
}

export interface SimCreateTopicCommandOutput {
  readonly TopicArn?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim SNS DeleteTopic command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sns/command/DeleteTopicCommand/
 */
export interface SimDeleteTopicCommand {
  readonly input: SimDeleteTopicCommandInput;
}

export interface SimDeleteTopicCommandInput {
  readonly TopicArn?: string | undefined;
}

export interface SimDeleteTopicCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim SNS ListTopics command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sns/command/ListTopicsCommand/
 */
export interface SimListTopicsCommand {
  readonly input: SimListTopicsCommandInput;
}

export interface SimListTopicsCommandInput {
  readonly NextToken?: string | undefined;
}

export interface SimListTopicsCommandOutput {
  readonly Topics?: readonly SimSnsListedTopic[] | undefined;
  readonly NextToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim SNS GetTopicAttributes command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sns/command/GetTopicAttributesCommand/
 */
export interface SimGetTopicAttributesCommand {
  readonly input: SimGetTopicAttributesCommandInput;
}

export interface SimGetTopicAttributesCommandInput {
  readonly TopicArn?: string | undefined;
}

export interface SimGetTopicAttributesCommandOutput {
  readonly Attributes?: Record<string, string> | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim SNS SetTopicAttributes command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sns/command/SetTopicAttributesCommand/
 */
export interface SimSetTopicAttributesCommand {
  readonly input: SimSetTopicAttributesCommandInput;
}

export interface SimSetTopicAttributesCommandInput {
  readonly TopicArn?: string | undefined;
  readonly AttributeName?: string | undefined;
  readonly AttributeValue?: string | undefined;
}

export interface SimSetTopicAttributesCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim SNS TagResource command.
 */
export interface SimTagResourceCommand {
  readonly input: SimTagResourceCommandInput;
}

export interface SimTagResourceCommandInput {
  readonly ResourceArn?: string | undefined;
  readonly Tags?: readonly SimSnsTag[] | undefined;
}

export interface SimTagResourceCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim SNS UntagResource command.
 */
export interface SimUntagResourceCommand {
  readonly input: SimUntagResourceCommandInput;
}

export interface SimUntagResourceCommandInput {
  readonly ResourceArn?: string | undefined;
  readonly TagKeys?: readonly string[] | undefined;
}

export interface SimUntagResourceCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim SNS ListTagsForResource command.
 */
export interface SimListTagsForResourceCommand {
  readonly input: SimListTagsForResourceCommandInput;
}

export interface SimListTagsForResourceCommandInput {
  readonly ResourceArn?: string | undefined;
}

export interface SimListTagsForResourceCommandOutput {
  readonly Tags: { Key: string; Value: string }[];
  readonly $metadata: SimResponseMetadata;
}
