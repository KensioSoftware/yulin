import {
  SimSqsInvalidParameterValue,
  SimSqsValidationException,
} from "../error/sim-sqs.error.js";

/**
 * Real SQS allows alphanumeric characters, hyphens and underscores, up to 80
 * characters. A FIFO queue name ends in `.fifo` within those 80, which is the
 * only way a period gets into a name.
 */
const queueNamePattern = /^(?:[\w-]{1,80}|[\w-]{1,75}\.fifo)$/u;

const fifoSuffix = ".fifo";

/**
 * The name of one simulated queue.
 *
 * The name is the whole identity of a queue: it is the resource part of the
 * ARN with no type separator in front of it, and the last segment of the queue
 * URL. Validating it in one place is what keeps a name that works here one
 * that would work on real AWS.
 */
export class SimSqsQueueName {
  public readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  /**
   * Read the queue name a request has to carry.
   */
  static required(name: string | undefined): SimSqsQueueName {
    if (name === undefined || name === "") {
      throw new SimSqsValidationException("A QueueName is required");
    }

    return this.of(name);
  }

  /**
   * Read a queue name from request input, refusing one real SQS would refuse.
   *
   * Whether a `.fifo` name matches the queue type asked for is the create
   * request's question, since only it knows whether `FifoQueue` was set.
   */
  static of(value: string): SimSqsQueueName {
    if (!queueNamePattern.test(value)) {
      throw new SimSqsInvalidParameterValue(
        `Value '${value}' for parameter QueueName is invalid. Reason: Can ` +
          `only include alphanumeric characters, hyphens, or underscores. 1 ` +
          `to 80 in length. A FIFO queue name ends with the .fifo suffix.`,
      );
    }

    return new this(value);
  }

  /**
   * Whether this is the name of a FIFO queue, which always ends `.fifo`.
   */
  get isFifo(): boolean {
    return this.value.endsWith(fifoSuffix);
  }

  /**
   * Refuse a name that does not match the queue type a create request asked
   * for.
   *
   * Real SQS ties the two together in both directions: a FIFO queue has to be
   * named `<name>.fifo`, and a standard queue cannot be, since a period is
   * otherwise not allowed in a name.
   */
  assertMatchesType(fifo: boolean): void {
    if (fifo && !this.isFifo) {
      throw new SimSqsInvalidParameterValue(
        `Value '${this.value}' for parameter QueueName is invalid. Reason: ` +
          `The name of a FIFO queue can only include alphanumeric ` +
          `characters, hyphens, or underscores, must end with .fifo suffix ` +
          `and be 1 to 80 in length.`,
      );
    }

    if (!fifo && this.isFifo) {
      throw new SimSqsInvalidParameterValue(
        `Value '${this.value}' for parameter QueueName is invalid. Reason: ` +
          `Can only include alphanumeric characters, hyphens, or ` +
          `underscores. 1 to 80 in length. A name ending .fifo needs the ` +
          `FifoQueue attribute set to true.`,
      );
    }
  }
}
