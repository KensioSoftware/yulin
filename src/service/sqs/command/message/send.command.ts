import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimSqsMessageAttributeInput } from "../../message/sim-sqs-message-attribute-value.js";

/**
 * A message system attribute as a send request carries it.
 *
 * Real SQS accepts only `AWSTraceHeader` here. Simulated SQS models no message
 * system attributes on send, so a request carrying one is refused.
 */
export interface SimSqsMessageSystemAttributeInput {
  readonly DataType?: string | undefined;
  readonly StringValue?: string | undefined;
}

/**
 * The message fields shared by SendMessage and one SendMessageBatch entry.
 */
export interface SimSqsSentMessage {
  readonly MessageBody?: string | undefined;
  readonly DelaySeconds?: number | undefined;
  readonly MessageAttributes?: SimSqsMessageAttributeInput | undefined;
  readonly MessageSystemAttributes?:
    | Readonly<Record<string, SimSqsMessageSystemAttributeInput | undefined>>
    | undefined;
  readonly MessageDeduplicationId?: string | undefined;
  readonly MessageGroupId?: string | undefined;
}

/**
 * Minimal structural sim SQS SendMessage command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sqs/command/SendMessageCommand/
 */
export interface SimSendMessageCommand {
  readonly input: SimSendMessageCommandInput;
}

export interface SimSendMessageCommandInput extends SimSqsSentMessage {
  readonly QueueUrl?: string | undefined;
}

export interface SimSendMessageCommandOutput {
  readonly MessageId?: string | undefined;
  readonly MD5OfMessageBody?: string | undefined;
  readonly MD5OfMessageAttributes?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * One entry of a SendMessageBatch request.
 */
export interface SimSqsSendMessageBatchEntry extends SimSqsSentMessage {
  readonly Id?: string | undefined;
}

/**
 * Minimal structural sim SQS SendMessageBatch command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sqs/command/SendMessageBatchCommand/
 */
export interface SimSendMessageBatchCommand {
  readonly input: SimSendMessageBatchCommandInput;
}

export interface SimSendMessageBatchCommandInput {
  readonly QueueUrl?: string | undefined;
  readonly Entries?: readonly SimSqsSendMessageBatchEntry[] | undefined;
}

export interface SimSqsSendMessageBatchResultEntry {
  readonly Id: string;
  readonly MessageId: string;
  readonly MD5OfMessageBody: string;
  readonly MD5OfMessageAttributes?: string | undefined;
}

/**
 * One entry of a batch request that failed on its own, while the rest of the
 * batch went through.
 */
export interface SimSqsBatchResultErrorEntry {
  readonly Id: string;
  readonly SenderFault: boolean;
  readonly Code: string;
  readonly Message?: string | undefined;
}

export interface SimSendMessageBatchCommandOutput {
  readonly Successful?:
    readonly SimSqsSendMessageBatchResultEntry[] | undefined;
  readonly Failed?: readonly SimSqsBatchResultErrorEntry[] | undefined;
  readonly $metadata: SimResponseMetadata;
}
