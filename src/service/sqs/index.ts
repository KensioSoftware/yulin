export { SimSqs } from "./sim-sqs.js";
export {
  simSqsSourceAccountConditionKey,
  simSqsSourceArnConditionKey,
  type SimSqsRequestOptions,
} from "./command/sim-sqs-request-options.js";
export { SimSqsQueue } from "./queue/sim-sqs-queue.js";
export {
  SimSqsQueueActivity,
  type SimSqsQueueWatcher,
} from "./queue/sim-sqs-queue-activity.js";
export {
  SimSqsQueueArn,
  type SimSqsQueueLocation,
  sqsQueueArnPrefix,
  sqsQueueUrl,
} from "./queue/sim-sqs-queue-arn.js";
export {
  type SimSqsQueueAttributeInput,
  SimSqsQueueAttributes,
} from "./queue/sim-sqs-queue-attributes.js";
export { SimSqsQueueName } from "./queue/sim-sqs-queue-name.js";
export { SimSqsQueuePolicy } from "./queue/sim-sqs-queue-policy.js";
export { SimSqsRedrivePolicy } from "./queue/sim-sqs-redrive-policy.js";
export {
  SimSqsQueueUrl,
  type SimSqsQueueUrlParts,
} from "./queue/sim-sqs-queue-url.js";
export { SimSqsMessage } from "./message/sim-sqs-message.js";
export { SimSqsMessageAttributes } from "./message/sim-sqs-message-attributes.js";
export type {
  SimSqsMessageAttributeInput,
  SimSqsMessageAttributeValue,
} from "./message/sim-sqs-message-attribute-value.js";
export { SimSqsMessageBody } from "./message/sim-sqs-message-body.js";
export {
  SimSqsBatchEntryIdsNotDistinct,
  SimSqsEmptyBatchRequest,
  SimSqsError,
  SimSqsInvalidAddress,
  SimSqsInvalidAttributeName,
  SimSqsInvalidAttributeValue,
  SimSqsInvalidBatchEntryId,
  SimSqsInvalidMessageContents,
  SimSqsInvalidParameterValue,
  SimSqsMessageNotInflight,
  SimSqsQueueDeletedRecently,
  SimSqsQueueDoesNotExist,
  SimSqsQueueNameExists,
  SimSqsReceiptHandleIsInvalid,
  SimSqsTooManyEntriesInBatchRequest,
  SimSqsUnsupportedOperation,
  SimSqsValidationException,
} from "./error/sim-sqs.error.js";
