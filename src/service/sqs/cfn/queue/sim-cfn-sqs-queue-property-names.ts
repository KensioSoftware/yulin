import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";

/**
 * The AWS::SQS::Queue properties carrying a queue attribute of the same name.
 *
 * CloudFormation names these exactly as the SQS API names the attributes, so
 * they are handed to CreateQueue rather than applied here. That leaves the
 * ranges and defaults in one place, the ones simulated SQS already validates.
 *
 * Five of them are amounts. `RedrivePolicy` is a JSON document, and
 * CloudFormation carries it as an object where SQS carries it as a string.
 */
export const attributePropertyNames: ReadonlySet<string> = new Set([
  "DelaySeconds",
  "MaximumMessageSize",
  "MessageRetentionPeriod",
  "ReceiveMessageWaitTimeSeconds",
  "RedrivePolicy",
  "VisibilityTimeout",
]);

/**
 * Real AWS::SQS::Queue properties this simulation does not model, with what
 * each of them would have changed.
 *
 * The queue is created without them and each one is recorded against the
 * Resource. A test reads the record to find out what the queue it deployed
 * behaves differently to AWS about.
 */
export const unsimulatedPropertyReasons: ReadonlyMap<string, string> = new Map([
  ["ContentBasedDeduplication", "only standard queues are simulated"],
  ["DeduplicationScope", "only standard queues are simulated"],
  ["FifoThroughputLimit", "only standard queues are simulated"],
  [
    "KmsDataKeyReusePeriodSeconds",
    "simulated SQS does not encrypt message bodies",
  ],
  ["KmsMasterKeyId", "simulated SQS does not encrypt message bodies"],
  [
    "RedriveAllowPolicy",
    "nothing enforces which queues may name this one as their dead-letter " +
      "queue, and setting the attribute through the SQS API is refused",
  ],
  ["SqsManagedSseEnabled", "simulated SQS does not encrypt message bodies"],
  ["Tags", "no simulated service reads a queue tag"],
]);

/**
 * The FifoQueue values that ask for a FIFO queue. CloudFormation carries a
 * boolean property as either, depending on where the value came from.
 */
export const fifoQueueValues: ReadonlySet<SimCfnTemplateValue> = new Set([
  true,
  "true",
]);

/**
 * The FifoQueue values that ask for a standard queue, which is the only kind
 * this simulation creates.
 */
export const standardQueueValues: ReadonlySet<SimCfnTemplateValue> = new Set([
  false,
  "false",
]);
