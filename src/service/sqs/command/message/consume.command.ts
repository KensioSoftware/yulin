import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimSqsBatchResultErrorEntry } from "./send.command.js";

/**
 * Minimal structural sim SQS DeleteMessage command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sqs/command/DeleteMessageCommand/
 */
export interface SimDeleteMessageCommand {
  readonly input: SimDeleteMessageCommandInput;
}

export interface SimDeleteMessageCommandInput {
  readonly QueueUrl?: string | undefined;
  readonly ReceiptHandle?: string | undefined;
}

export interface SimDeleteMessageCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * One entry of a DeleteMessageBatch request.
 */
export interface SimSqsDeleteMessageBatchEntry {
  readonly Id?: string | undefined;
  readonly ReceiptHandle?: string | undefined;
}

/**
 * Minimal structural sim SQS DeleteMessageBatch command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sqs/command/DeleteMessageBatchCommand/
 */
export interface SimDeleteMessageBatchCommand {
  readonly input: SimDeleteMessageBatchCommandInput;
}

export interface SimDeleteMessageBatchCommandInput {
  readonly QueueUrl?: string | undefined;
  readonly Entries?: readonly SimSqsDeleteMessageBatchEntry[] | undefined;
}

export interface SimSqsDeleteMessageBatchResultEntry {
  readonly Id: string;
}

export interface SimDeleteMessageBatchCommandOutput {
  readonly Successful?:
    readonly SimSqsDeleteMessageBatchResultEntry[] | undefined;
  readonly Failed?: readonly SimSqsBatchResultErrorEntry[] | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim SQS ChangeMessageVisibility command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sqs/command/ChangeMessageVisibilityCommand/
 */
export interface SimChangeMessageVisibilityCommand {
  readonly input: SimChangeMessageVisibilityCommandInput;
}

export interface SimChangeMessageVisibilityCommandInput {
  readonly QueueUrl?: string | undefined;
  readonly ReceiptHandle?: string | undefined;
  readonly VisibilityTimeout?: number | undefined;
}

export interface SimChangeMessageVisibilityCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
