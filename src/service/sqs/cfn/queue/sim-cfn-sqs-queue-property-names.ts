import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";

/**
 * The AWS::SQS::Queue properties carrying a queue attribute of the same name.
 *
 * CloudFormation names these exactly as the SQS API names the attributes, so
 * they are handed to CreateQueue rather than applied here. That leaves the
 * ranges and defaults in one place: the ones simulated SQS already validates.
 */
export const attributePropertyNames: ReadonlySet<string> = new Set([
  "DelaySeconds",
  "MaximumMessageSize",
  "MessageRetentionPeriod",
  "ReceiveMessageWaitTimeSeconds",
  "VisibilityTimeout",
]);

/**
 * Real AWS::SQS::Queue properties this simulation does not model, with what
 * each of them would have changed.
 *
 * The queue is created without them and each one is recorded against the
 * Resource. A queue deployed without its redrive policy looks like a queue with
 * a dead-letter queue to the template that wrote it and has none, so a test
 * expecting a failed message to end up somewhere needs to find out that it
 * never will.
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
    "dead-letter queues are not simulated, so nothing enforces which queues " +
      "may name this one as theirs",
  ],
  [
    "RedrivePolicy",
    "dead-letter queues are not simulated, so a message that is received " +
      "past maxReceiveCount stays on this queue rather than moving",
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
