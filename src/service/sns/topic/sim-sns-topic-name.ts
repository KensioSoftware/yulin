import {
  SimSnsInvalidParameterException,
  SimSnsUnsimulatedInputException,
} from "../error/sim-sns.error.js";

/**
 * Real SNS allows alphanumeric characters, hyphens and underscores, up to 256
 * characters. A FIFO topic name additionally ends in `.fifo`, which is the only
 * way a period gets into a name.
 */
const topicNamePattern = /^[\w-]{1,256}$/;

const fifoSuffix = ".fifo";

/**
 * The name of one simulated topic.
 *
 * The name is the whole identity of a topic: it is the resource part of the
 * ARN with no type separator in front of it, and it is unique within one
 * Account and Region. Validating it in one place is what keeps a name that
 * works here one that would work on real AWS.
 */
export class SimSnsTopicName {
  public readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  /**
   * Read the topic name a request has to carry.
   */
  static required(name: string | undefined): SimSnsTopicName {
    if (name === undefined || name === "") {
      throw new SimSnsInvalidParameterException(
        "Invalid parameter: Name is required",
      );
    }

    return this.of(name);
  }

  /**
   * Read a topic name from request input, refusing one real SNS would refuse.
   */
  static of(value: string): SimSnsTopicName {
    if (value.endsWith(fifoSuffix)) {
      throw new SimSnsUnsimulatedInputException(
        `Topic name '${value}' names a FIFO topic, which simulated SNS does ` +
          `not support. Only standard topics are simulated.`,
      );
    }

    if (!topicNamePattern.test(value)) {
      throw new SimSnsInvalidParameterException(
        `Invalid parameter: Topic Name '${value}' is invalid. Topic names ` +
          `must be made up of only uppercase and lowercase ASCII letters, ` +
          `numbers, underscores, and hyphens, and must be between 1 and 256 ` +
          `characters long.`,
      );
    }

    return new this(value);
  }
}
