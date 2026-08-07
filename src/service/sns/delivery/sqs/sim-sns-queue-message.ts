import type { SimSendMessageCommand } from "../../../sqs/command/message/send.command.js";
import type { SimSnsDeliveryRequest } from "../sim-sns-delivery.js";
import { SimSnsEnvelope } from "../sim-sns-envelope.js";

/**
 * What one queue is sent for a published message.
 *
 * Which form the body takes is the subscription's business rather than the
 * queue's. `RawMessageDelivery` is an SQS and HTTP protocol setting on real
 * SNS, so it is asked here rather than anywhere a Lambda delivery would see it:
 * a function subscribed with it on is invoked with the whole event all the
 * same.
 *
 * Raw delivery takes the envelope away, so the message attributes have nowhere
 * to travel but the SQS message itself. A consumer written for raw delivery
 * reads them there, and one taking the envelope reads them out of it.
 */
export class SimSnsQueueMessage {
  private readonly request: SimSnsDeliveryRequest;

  constructor(request: SimSnsDeliveryRequest) {
    this.request = request;
  }

  /**
   * The SendMessage input this delivery becomes.
   */
  sendMessageInput(queueUrl: string): SimSendMessageCommand["input"] {
    const { subscription, message, notification } = this.request;

    if (subscription.attributes.rawMessageDelivery) {
      return {
        QueueUrl: queueUrl,
        MessageBody: message.body.value,
        MessageAttributes: message.attributes.asSqsAttributes(),
      };
    }

    return {
      QueueUrl: queueUrl,
      MessageBody: new SimSnsEnvelope({ notification }).body,
    };
  }
}
