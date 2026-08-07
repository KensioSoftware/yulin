import {
  SimSnsInvalidParameterException,
  SimSnsUnsimulatedInputException,
} from "../error/sim-sns.error.js";

/**
 * The number of colon separated parts in a queue ARN.
 *
 * A queue ARN has no resource type separator, so the queue name is the sixth
 * and last part, the same shape a topic ARN has.
 */
const queueArnParts = 6;

interface SimSnsQueueEndpointArnProperties {
  readonly value: string;
  readonly regionName: string;
  readonly accountId: string;
  readonly queueName: string;
}

/**
 * The SQS queue ARN a subscription's endpoint names.
 *
 * All three of the Region, the Account and the name are read out, because a
 * delivery resolves the queue in the scope the ARN gives rather than in the
 * topic's. Real SNS delivers to a queue in another Region, so this does too.
 */
export class SimSnsQueueEndpointArn {
  public readonly value: string;
  public readonly regionName: string;
  public readonly accountId: string;
  public readonly queueName: string;

  private constructor(properties: SimSnsQueueEndpointArnProperties) {
    this.value = properties.value;
    this.regionName = properties.regionName;
    this.accountId = properties.accountId;
    this.queueName = properties.queueName;
  }

  /**
   * Read a queue ARN, refusing anything a queue could not be reached by.
   *
   * A FIFO queue is refused by its name, as real SNS refuses one for a standard
   * topic: only a FIFO topic delivers to a FIFO queue. Simulated SQS has no
   * FIFO queues either, so without this the refusal would arrive later as a
   * queue that does not exist, which points at the wrong thing to fix.
   */
  static parse(endpoint: string): SimSnsQueueEndpointArn {
    const parts = endpoint.split(":");
    const [prefix, partition, service, regionName, accountId, queueName] =
      parts;

    if (
      parts.length !== queueArnParts ||
      prefix !== "arn" ||
      partition !== "aws" ||
      service !== "sqs" ||
      regionName === undefined ||
      regionName === "" ||
      accountId === undefined ||
      accountId === "" ||
      queueName === undefined ||
      queueName === ""
    ) {
      throw new SimSnsInvalidParameterException(
        `Invalid parameter: Endpoint Reason: ${endpoint} is not an SQS queue ` +
          `ARN, which is arn:aws:sqs:<region>:<account-id>:<queue-name>`,
      );
    }

    if (queueName.endsWith(".fifo")) {
      throw new SimSnsUnsimulatedInputException(
        `Cannot subscribe ${endpoint}: only a FIFO topic delivers to a FIFO ` +
          "queue, and simulated SNS has only standard topics.",
      );
    }

    return new this({
      value: endpoint,
      regionName,
      accountId,
      queueName,
    });
  }
}
