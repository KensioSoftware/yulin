import { SimSnsUnsimulatedInputException } from "../../error/sim-sns.error.js";
import { SimSnsMessageAttributes } from "../../message/sim-sns-message-attributes.js";
import type { SimSnsPublishedMessageInput } from "../../message/sim-sns-published-message.js";
import type {
  SimPublishCommandInput,
  SimSnsPublishedFields,
} from "./publish.command.js";

/**
 * Refuse a publish to somewhere other than a topic.
 *
 * Real SNS publishes to a topic, to a mobile application endpoint, or to a
 * phone number. Only the topic is simulated, so the other two are refused
 * rather than answered with a message id for a message that reached nothing.
 */
export function refuseUnsimulatedPublishTarget(
  input: SimPublishCommandInput,
): void {
  if (input.TargetArn !== undefined) {
    throw new SimSnsUnsimulatedInputException(
      "TargetArn publishes to a mobile application endpoint, which simulated " +
        "SNS does not support. Publish to a TopicArn instead.",
    );
  }

  if (input.PhoneNumber !== undefined) {
    throw new SimSnsUnsimulatedInputException(
      "PhoneNumber publishes an SMS message, which simulated SNS does not " +
        "support. Publish to a TopicArn instead.",
    );
  }
}

/**
 * Read the message a publish describes, refusing the fields this simulation
 * does not model.
 *
 * The FIFO fields are refused because there are no FIFO topics here to give
 * them meaning, and a message accepted with a `MessageGroupId` that ordered
 * nothing would be a message a test believed was ordered. `MessageStructure`
 * is refused because a `json` structure picks a different body per protocol,
 * and the protocols it picks between are not simulated, so it would be a body
 * chosen by a rule that never ran.
 */
export function simSnsPublishedMessageInput(
  published: SimSnsPublishedFields,
): SimSnsPublishedMessageInput {
  if (
    published.MessageDeduplicationId !== undefined ||
    published.MessageGroupId !== undefined
  ) {
    throw new SimSnsUnsimulatedInputException(
      "MessageDeduplicationId and MessageGroupId apply to FIFO topics, which " +
        "simulated SNS does not support",
    );
  }

  if (published.MessageStructure !== undefined) {
    throw new SimSnsUnsimulatedInputException(
      "MessageStructure carries a different message body per protocol, which " +
        "simulated SNS does not model",
    );
  }

  return {
    message: published.Message,
    subject: published.Subject,
    attributes: SimSnsMessageAttributes.of(published.MessageAttributes),
  };
}
