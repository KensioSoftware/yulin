import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimSqsQueueAttributeInput } from "../../queue/sim-sqs-queue-attributes.js";

/**
 * Minimal structural sim SQS CreateQueue command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sqs/command/CreateQueueCommand/
 */
export interface SimCreateQueueCommand {
  readonly input: SimCreateQueueCommandInput;
}

export interface SimCreateQueueCommandInput {
  readonly QueueName?: string | undefined;
  readonly Attributes?: SimSqsQueueAttributeInput | undefined;
  /** The SQS API names this parameter in lower case, unlike every other one. */
  readonly tags?: Readonly<Record<string, string>> | undefined;
}

export interface SimCreateQueueCommandOutput {
  readonly QueueUrl?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim SQS GetQueueUrl command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sqs/command/GetQueueUrlCommand/
 */
export interface SimGetQueueUrlCommand {
  readonly input: SimGetQueueUrlCommandInput;
}

export interface SimGetQueueUrlCommandInput {
  readonly QueueName?: string | undefined;
  readonly QueueOwnerAWSAccountId?: string | undefined;
}

export interface SimGetQueueUrlCommandOutput {
  readonly QueueUrl?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim SQS ListQueues command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sqs/command/ListQueuesCommand/
 */
export interface SimListQueuesCommand {
  readonly input: SimListQueuesCommandInput;
}

export interface SimListQueuesCommandInput {
  readonly QueueNamePrefix?: string | undefined;
  readonly MaxResults?: number | undefined;
  readonly NextToken?: string | undefined;
}

export interface SimListQueuesCommandOutput {
  readonly QueueUrls?: readonly string[] | undefined;
  readonly NextToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim SQS DeleteQueue command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sqs/command/DeleteQueueCommand/
 */
export interface SimDeleteQueueCommand {
  readonly input: SimDeleteQueueCommandInput;
}

export interface SimDeleteQueueCommandInput {
  readonly QueueUrl?: string | undefined;
}

export interface SimDeleteQueueCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim SQS GetQueueAttributes command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sqs/command/GetQueueAttributesCommand/
 */
export interface SimGetQueueAttributesCommand {
  readonly input: SimGetQueueAttributesCommandInput;
}

export interface SimGetQueueAttributesCommandInput {
  readonly QueueUrl?: string | undefined;
  readonly AttributeNames?: readonly string[] | undefined;
}

export interface SimGetQueueAttributesCommandOutput {
  readonly Attributes?: Record<string, string> | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim SQS SetQueueAttributes command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sqs/command/SetQueueAttributesCommand/
 */
export interface SimSetQueueAttributesCommand {
  readonly input: SimSetQueueAttributesCommandInput;
}

export interface SimSetQueueAttributesCommandInput {
  readonly QueueUrl?: string | undefined;
  readonly Attributes?: SimSqsQueueAttributeInput | undefined;
}

export interface SimSetQueueAttributesCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim SQS PurgeQueue command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sqs/command/PurgeQueueCommand/
 */
export interface SimPurgeQueueCommand {
  readonly input: SimPurgeQueueCommandInput;
}

export interface SimPurgeQueueCommandInput {
  readonly QueueUrl?: string | undefined;
}

export interface SimPurgeQueueCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
