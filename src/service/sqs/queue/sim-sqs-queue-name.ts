import {
  SimSqsInvalidParameterValue,
  SimSqsUnsupportedOperation,
  SimSqsValidationException,
} from "../error/sim-sqs.error.js";

/**
 * Real SQS allows alphanumeric characters, hyphens and underscores, up to 80
 * characters. A FIFO queue name additionally ends in `.fifo`, which is the only
 * way a period gets into a name.
 */
const queueNamePattern = /^[\w-]{1,80}$/;

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
   */
  static of(value: string): SimSqsQueueName {
    if (value.endsWith(fifoSuffix)) {
      throw new SimSqsUnsupportedOperation(
        `Queue name '${value}' names a FIFO queue, which simulated SQS does ` +
          `not support. Only standard queues are simulated.`,
      );
    }

    if (!queueNamePattern.test(value)) {
      throw new SimSqsInvalidParameterValue(
        `Value '${value}' for parameter QueueName is invalid. Reason: Can ` +
          `only include alphanumeric characters, hyphens, or underscores. 1 ` +
          `to 80 in length.`,
      );
    }

    return new this(value);
  }
}
