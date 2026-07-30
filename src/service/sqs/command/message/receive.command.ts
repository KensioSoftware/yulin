import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimSqsMessageAttributeValue } from "../../message/sim-sqs-message-attribute-value.js";

/**
 * One message as sim SQS reports it in a receive response.
 *
 * https://docs.aws.amazon.com/AWSSimpleQueueService/latest/APIReference/API_Message.html
 */
export interface SimSqsReceivedMessage {
  readonly MessageId: string;
  readonly ReceiptHandle: string;
  readonly MD5OfBody: string;
  readonly Body: string;
  readonly Attributes?: Record<string, string> | undefined;
  readonly MessageAttributes?:
    Record<string, SimSqsMessageAttributeValue> | undefined;
  readonly MD5OfMessageAttributes?: string | undefined;
}

/**
 * Minimal structural sim SQS ReceiveMessage command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sqs/command/ReceiveMessageCommand/
 */
export interface SimReceiveMessageCommand {
  readonly input: SimReceiveMessageCommandInput;
}

export interface SimReceiveMessageCommandInput {
  readonly QueueUrl?: string | undefined;
  readonly MaxNumberOfMessages?: number | undefined;
  readonly VisibilityTimeout?: number | undefined;
  readonly WaitTimeSeconds?: number | undefined;
  readonly MessageAttributeNames?: readonly string[] | undefined;
  readonly MessageSystemAttributeNames?: readonly string[] | undefined;
  /** Discontinued by real SQS, and the same thing as the name above. */
  readonly AttributeNames?: readonly string[] | undefined;
  readonly ReceiveRequestAttemptId?: string | undefined;
}

export interface SimReceiveMessageCommandOutput {
  readonly Messages?: readonly SimSqsReceivedMessage[] | undefined;
  readonly $metadata: SimResponseMetadata;
}
