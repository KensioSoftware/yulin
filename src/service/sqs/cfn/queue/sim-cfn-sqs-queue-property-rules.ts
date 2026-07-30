import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../cloudformation/template/value/sim-cfn-template-value.js";

/**
 * The AWS::SQS::Queue properties carrying a queue attribute of the same name.
 *
 * CloudFormation names these exactly as the SQS API names the attributes, so
 * they are handed to CreateQueue rather than applied here. That leaves the
 * ranges and defaults in one place: the ones simulated SQS already validates.
 */
const attributePropertyNames: ReadonlySet<string> = new Set([
  "DelaySeconds",
  "MaximumMessageSize",
  "MessageRetentionPeriod",
  "ReceiveMessageWaitTimeSeconds",
  "VisibilityTimeout",
]);

/**
 * Real AWS::SQS::Queue properties this simulation does not model.
 *
 * A queue deployed without its redrive policy would look like a queue with a
 * dead-letter queue to the template and have none, so these fail the Resource
 * rather than being dropped on the way through.
 */
const unsimulatedPropertyNames: ReadonlySet<string> = new Set([
  "ContentBasedDeduplication",
  "DeduplicationScope",
  "FifoThroughputLimit",
  "KmsDataKeyReusePeriodSeconds",
  "KmsMasterKeyId",
  "RedriveAllowPolicy",
  "RedrivePolicy",
  "SqsManagedSseEnabled",
  "Tags",
]);

/**
 * The FifoQueue values that ask for a FIFO queue. CloudFormation carries a
 * boolean property as either, depending on where the value came from.
 */
const fifoQueueValues: ReadonlySet<SimCfnTemplateValue> = new Set([
  true,
  "true",
]);

/**
 * The FifoQueue values that ask for a standard queue, which is the only kind
 * this simulation creates.
 */
const standardQueueValues: ReadonlySet<SimCfnTemplateValue> = new Set([
  false,
  "false",
]);

/**
 * Build the error a property of an AWS::SQS::Queue Resource is refused with.
 *
 * The wording matters. Sim CloudFormation skips a Resource whose error reads as
 * an unsupported Resource type, and skipping is the wrong answer for a queue
 * that cannot be created as the template asks: the stack would deploy without
 * it.
 */
export function sqsQueuePropertyError(
  logicalId: string,
  reason: string,
): Error {
  return new Error(`Invalid AWS::SQS::Queue Resource ${logicalId}: ${reason}`);
}

interface SimCfnSqsQueuePropertyRulesProperties {
  readonly logicalId: string;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * Which AWS::SQS::Queue properties simulated SQS can act on.
 *
 * Anything else fails the Resource. Being stricter than CloudFormation shows up
 * as a puzzling deployment failure here; being looser shows up as a queue
 * behaving one way in a test and another way on AWS.
 */
export class SimCfnSqsQueuePropertyRules {
  private readonly logicalId: string;
  private readonly properties: SimCfnTemplateValueRecord;

  constructor(properties: SimCfnSqsQueuePropertyRulesProperties) {
    this.logicalId = properties.logicalId;
    this.properties = properties.properties;
  }

  /**
   * Whether a property carries a queue attribute of the same name.
   */
  isAttributeProperty(name: string): boolean {
    return attributePropertyNames.has(name);
  }

  /**
   * Refuse everything about this Resource that is not simulated.
   */
  assertSimulated(): void {
    this.refuseFifoQueue();

    for (const name of Object.keys(this.properties)) {
      this.assertSimulatedProperty(name);
    }
  }

  /**
   * Refuse a FIFO queue.
   *
   * Only standard queues are simulated, and a FIFO queue quietly created as a
   * standard one would take messages in an order the deployment does not
   * promise, so the Resource fails instead. A value that is neither true nor
   * false is refused as well, rather than read as false: CloudFormation would
   * refuse it too, and the queue it asked for is not knowable.
   */
  private refuseFifoQueue(): void {
    const fifo = this.properties["FifoQueue"];

    if (fifo === undefined || standardQueueValues.has(fifo)) {
      return;
    }

    if (fifoQueueValues.has(fifo)) {
      throw sqsQueuePropertyError(
        this.logicalId,
        "FifoQueue names a FIFO queue, which simulated SQS does not " +
          "simulate. Only standard queues are simulated, so the queue is not " +
          "created rather than created as a standard queue",
      );
    }

    throw sqsQueuePropertyError(
      this.logicalId,
      "FifoQueue must be true or false",
    );
  }

  private assertSimulatedProperty(name: string): void {
    if (unsimulatedPropertyNames.has(name)) {
      throw sqsQueuePropertyError(
        this.logicalId,
        `${name} is a real AWS::SQS::Queue property that simulated SQS does ` +
          `not simulate, so it is refused rather than ignored`,
      );
    }

    if (
      name !== "QueueName" &&
      name !== "FifoQueue" &&
      !this.isAttributeProperty(name)
    ) {
      throw sqsQueuePropertyError(
        this.logicalId,
        `${name} is not an AWS::SQS::Queue property`,
      );
    }
  }
}
