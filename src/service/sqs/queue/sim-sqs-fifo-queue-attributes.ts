import {
  SimSqsInvalidAttributeName,
  SimSqsInvalidAttributeValue,
} from "../error/sim-sqs.error.js";
import type { SimSqsQueueAttributeInput } from "./sim-sqs-queue-attributes.js";
import {
  simSqsFifoEntries,
  type SimSqsQueueType,
} from "./sim-sqs-queue-type.js";

/**
 * The attribute that makes a queue a FIFO queue. It is set when the queue is
 * created and never afterwards.
 */
export const simSqsFifoQueueAttributeName = "FifoQueue";

/**
 * The attributes only a FIFO queue has.
 */
export const simSqsFifoQueueAttributeNames: ReadonlySet<string> = new Set([
  simSqsFifoQueueAttributeName,
  "ContentBasedDeduplication",
  "DeduplicationScope",
  "FifoThroughputLimit",
]);

/**
 * The values each settable FIFO attribute takes.
 */
const allowedValues: ReadonlyMap<string, readonly string[]> = new Map([
  ["ContentBasedDeduplication", ["false", "true"]],
  ["DeduplicationScope", ["queue", "messageGroup"]],
  ["FifoThroughputLimit", ["perQueue", "perMessageGroupId"]],
]);

/**
 * The attributes of a FIFO queue: how it deduplicates, and the throughput
 * setting that goes with it.
 *
 * `FifoThroughputLimit` changes nothing here, since nothing in this simulation
 * is throttled. It is held and validated because real SQS refuses a
 * `perMessageGroupId` limit unless deduplication is per message group.
 */
export class SimSqsFifoQueueAttributes implements SimSqsQueueType {
  private readonly values: ReadonlyMap<string, string>;

  private constructor(values: ReadonlyMap<string, string>) {
    this.values = values;
  }

  /**
   * The values a FIFO queue created with none of them set has.
   */
  static defaults(): SimSqsFifoQueueAttributes {
    return new this(
      new Map([
        ["ContentBasedDeduplication", "false"],
        ["DeduplicationScope", "queue"],
        ["FifoThroughputLimit", "perQueue"],
      ]),
    );
  }

  get fifo(): SimSqsFifoQueueAttributes {
    return this;
  }

  /**
   * Whether a message sent with no deduplication id takes the SHA-256 of its
   * body as one.
   */
  get contentBasedDeduplication(): boolean {
    return this.values.get("ContentBasedDeduplication") === "true";
  }

  /**
   * Whether a deduplication id is unique within its message group rather than
   * within the whole queue.
   */
  get deduplicatesPerMessageGroup(): boolean {
    return this.values.get("DeduplicationScope") === "messageGroup";
  }

  /**
   * Apply the FIFO attribute values a request asks for.
   */
  with(requested: SimSqsQueueAttributeInput): SimSqsFifoQueueAttributes {
    const values = new Map(this.values);

    for (const [name, value] of simSqsFifoEntries(requested)) {
      values.set(name, allowedValue(name, value));
    }

    const updated = new SimSqsFifoQueueAttributes(values);

    updated.assertThroughputLimit();

    return updated;
  }

  /**
   * Whether every FIFO attribute a request names already holds the value it
   * asks for.
   */
  matches(requested: SimSqsQueueAttributeInput): boolean {
    return simSqsFifoEntries(requested).every(
      ([name, value]) => this.values.get(name) === value,
    );
  }

  /**
   * Add the FIFO attributes to what SQS reports about the queue, including
   * `FifoQueue` itself.
   */
  reportInto(reported: Map<string, string>): void {
    reported.set(simSqsFifoQueueAttributeName, "true");

    for (const [name, value] of this.values) {
      reported.set(name, value);
    }
  }

  private assertThroughputLimit(): void {
    if (
      this.values.get("FifoThroughputLimit") === "perMessageGroupId" &&
      !this.deduplicatesPerMessageGroup
    ) {
      throw new SimSqsInvalidAttributeValue(
        "Invalid value for the parameter FifoThroughputLimit. Reason: " +
          "perMessageGroupId is allowed only when DeduplicationScope is " +
          "messageGroup.",
      );
    }
  }
}

/**
 * Read one FIFO attribute value, refusing `FifoQueue` itself and any value
 * real SQS does not accept.
 */
function allowedValue(name: string, value: string): string {
  const allowed = allowedValues.get(name);

  if (allowed === undefined) {
    throw new SimSqsInvalidAttributeName(
      `Attribute ${name} can only be set when a queue is created. A queue ` +
        `cannot be changed from one type to the other.`,
    );
  }

  if (!allowed.includes(value)) {
    throw new SimSqsInvalidAttributeValue(
      `Invalid value for the parameter ${name}. Reason: Must be one of ` +
        `${allowed.join(", ")}.`,
    );
  }

  return value;
}
