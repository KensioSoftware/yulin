import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimSnsMessageAttributeInput } from "../../message/sim-sns-message-attribute-value.js";

/**
 * The message fields shared by Publish and one PublishBatch entry.
 */
export interface SimSnsPublishedFields {
  readonly Message?: string | undefined;
  readonly Subject?: string | undefined;
  readonly MessageStructure?: string | undefined;
  readonly MessageAttributes?: SimSnsMessageAttributeInput | undefined;
  readonly MessageDeduplicationId?: string | undefined;
  readonly MessageGroupId?: string | undefined;
}

/**
 * Minimal structural sim SNS Publish command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sns/command/PublishCommand/
 */
export interface SimPublishCommand {
  readonly input: SimPublishCommandInput;
}

export interface SimPublishCommandInput extends SimSnsPublishedFields {
  readonly TopicArn?: string | undefined;

  /** The endpoint of a mobile application, which is not simulated. */
  readonly TargetArn?: string | undefined;

  /** An SMS destination, which is not simulated. */
  readonly PhoneNumber?: string | undefined;
}

export interface SimPublishCommandOutput {
  readonly MessageId?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * One entry of a PublishBatch request.
 */
export interface SimSnsPublishBatchRequestEntry extends SimSnsPublishedFields {
  readonly Id?: string | undefined;
}

/**
 * Minimal structural sim SNS PublishBatch command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sns/command/PublishBatchCommand/
 */
export interface SimPublishBatchCommand {
  readonly input: SimPublishBatchCommandInput;
}

export interface SimPublishBatchCommandInput {
  readonly TopicArn?: string | undefined;
  readonly PublishBatchRequestEntries?:
    | readonly SimSnsPublishBatchRequestEntry[]
    | undefined;
}

export interface SimSnsPublishBatchResultEntry {
  readonly Id: string;
  readonly MessageId: string;
}

/**
 * One entry of a batch request that failed on its own, while the rest of the
 * batch went through.
 */
export interface SimSnsBatchResultErrorEntry {
  readonly Id: string;
  readonly SenderFault: boolean;
  readonly Code: string;
  readonly Message?: string | undefined;
}

export interface SimPublishBatchCommandOutput {
  readonly Successful?: readonly SimSnsPublishBatchResultEntry[] | undefined;
  readonly Failed?: readonly SimSnsBatchResultErrorEntry[] | undefined;
  readonly $metadata: SimResponseMetadata;
}
