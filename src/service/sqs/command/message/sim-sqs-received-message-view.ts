import type { SimSqsMessage } from "../../message/sim-sqs-message.js";
import type { SimSqsMessageAttributes } from "../../message/sim-sqs-message-attributes.js";
import type { SimSqsRequestedSystemAttributes } from "../../message/sim-sqs-message-system-attributes.js";
import type { SimSqsReceivedMessage } from "./receive.command.js";

interface SimSqsReceivedMessageViewProperties {
  readonly systemAttributes: SimSqsRequestedSystemAttributes;
  readonly messageAttributeNames: readonly string[] | undefined;
}

/**
 * How one receive request reports the messages it takes.
 *
 * Both attribute kinds are reported only when the request named them, which is
 * what real SQS does. A consumer that never named an attribute gets a message
 * without it here, rather than one that would lose the attribute on AWS.
 */
export class SimSqsReceivedMessageView {
  private readonly systemAttributes: SimSqsRequestedSystemAttributes;
  private readonly messageAttributeNames: readonly string[] | undefined;

  constructor(properties: SimSqsReceivedMessageViewProperties) {
    this.systemAttributes = properties.systemAttributes;
    this.messageAttributeNames = properties.messageAttributeNames;
  }

  /**
   * One received message as SQS reports it.
   */
  of(message: SimSqsMessage, receiptHandle: string): SimSqsReceivedMessage {
    return {
      MessageId: message.messageId,
      ReceiptHandle: receiptHandle,
      MD5OfBody: message.body.digest,
      Body: message.body.value,
      Attributes: this.systemAttributes.from(message.systemAttributeValues()),
      ...reportedMessageAttributes(
        message.attributes.selected(this.messageAttributeNames),
      ),
    };
  }
}

function reportedMessageAttributes(
  selected: SimSqsMessageAttributes,
): Partial<SimSqsReceivedMessage> {
  if (selected.isEmpty) {
    return {};
  }

  return {
    MessageAttributes: selected.reported(),
    MD5OfMessageAttributes: selected.digest(),
  };
}
