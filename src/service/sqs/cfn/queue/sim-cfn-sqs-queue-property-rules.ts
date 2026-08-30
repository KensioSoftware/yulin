import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCfnPropertyIgnorer } from "../../../cloudformation/resource/ignore/sim-cfn-ignored-property.type.js";
import { SimCfnSkippedProperties } from "../../../cloudformation/resource/ignore/sim-cfn-skipped-properties.js";
import {
  attributePropertyNames,
  fifoQueueValues,
  standardQueueValues,
  unsimulatedPropertyReasons,
} from "./sim-cfn-sqs-queue-property-names.js";

/**
 * Build the error a property of an AWS::SQS::Queue Resource is refused with.
 *
 * Refusing is the rarer answer now. A property simulated SQS cannot act on is
 * recorded against the Resource and the queue is created without it, so what
 * is left here is the template that describes no queue at all: a QueueName
 * that is not a name, a FifoQueue that is neither true nor false.
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
  readonly ignorer: SimCfnPropertyIgnorer;
}

/**
 * What simulated SQS does with each AWS::SQS::Queue property it is handed.
 *
 * A property this simulation cannot act on does not stop the queue being
 * created. It is left out and recorded against the Resource, where a test can
 * find it, so a stack full of queues still deploys around the settings this
 * models nothing for. Refusing is kept for the template that describes no
 * queue at all.
 */
export class SimCfnSqsQueuePropertyRules {
  private readonly logicalId: string;
  private readonly properties: SimCfnTemplateValueRecord;
  private readonly ignorer: SimCfnPropertyIgnorer;
  private readonly skipped: SimCfnSkippedProperties;

  constructor(properties: SimCfnSqsQueuePropertyRulesProperties) {
    this.logicalId = properties.logicalId;
    this.properties = properties.properties;
    this.ignorer = properties.ignorer;
    this.skipped = new SimCfnSkippedProperties({
      rules: unsimulatedPropertyReasons,
      properties: this.properties,
      error: (reason): Error => sqsQueuePropertyError(this.logicalId, reason),
    });
  }

  /**
   * Whether a property carries a queue attribute of the same name.
   */
  isAttributeProperty(name: string): boolean {
    return attributePropertyNames.has(name);
  }

  /**
   * Record everything about this Resource the queue is created without.
   */
  apply(): void {
    this.applyToFifoQueue();
    this.skipped.assertConstraints();

    for (const name of Object.keys(this.properties)) {
      this.applyToProperty(name);
    }
  }

  /**
   * Refuse a FIFO queue.
   *
   * This is one of the few properties still worth refusing over. A FIFO queue
   * is named `<name>.fifo`, and simulated SQS refuses that name to an SDK
   * caller as well, so there is no queue to create the Resource without the
   * property as: the only queue that could exist would answer to a different
   * name from the one the template gave it, and everything referring to it
   * would be referring to nothing.
   *
   * A value that is neither true nor false is refused as well, rather than
   * read as false: CloudFormation refuses it too, and the queue it asked for
   * is not knowable.
   */
  private applyToFifoQueue(): void {
    const fifo = this.properties["FifoQueue"];

    if (fifo === undefined || standardQueueValues.has(fifo)) {
      return;
    }

    if (fifoQueueValues.has(fifo)) {
      throw sqsQueuePropertyError(
        this.logicalId,
        "FifoQueue names a FIFO queue, which simulated SQS does not " +
          "simulate. Only standard queues are simulated, and a FIFO queue " +
          "is named <name>.fifo, which simulated SQS refuses, so there is no " +
          "queue to create under the name the template gave it",
      );
    }

    throw sqsQueuePropertyError(
      this.logicalId,
      "FifoQueue must be true or false",
    );
  }

  private applyToProperty(name: string): void {
    const unsimulatedReason = this.skipped.reasonFor(name);

    if (unsimulatedReason !== undefined) {
      this.ignorer.ignoreProperty(
        name,
        `${name} is a real AWS::SQS::Queue property simulated SQS does not ` +
          `act on: ${unsimulatedReason}`,
      );

      return;
    }

    if (
      name !== "QueueName" &&
      name !== "FifoQueue" &&
      !this.isAttributeProperty(name)
    ) {
      this.ignorer.ignoreProperty(
        name,
        `${name} is not a property simulated SQS knows about, so the queue ` +
          `is created without it`,
      );
    }
  }
}
