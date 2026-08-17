import type { SimSnsOptOutList } from "../../sms/sim-sns-opt-out-list.js";
import { SimSnsPhoneNumber } from "../../sms/sim-sns-phone-number.js";
import { SimSnsSentSmsMessage } from "../../sms/sim-sns-sent-sms-message.js";
import type { SimSnsSentSmsStore } from "../../sms/sim-sns-sent-sms-store.js";
import type {
  SimSnsDeliveryEndpoints,
  SimSnsDeliveryRequest,
} from "../sim-sns-delivery.js";

interface SimSnsDeliverySmsProperties {
  readonly optOutList: SimSnsOptOutList;
  readonly sent: SimSnsSentSmsStore;
}

/**
 * The phone numbers a topic delivers to, which are simulated SNS's own.
 *
 * A queue or a function is another simulated service, so where those deliver is
 * handed to simulated SNS from outside. An SMS reaches no service at all: it is
 * recorded on the same store a publish straight to a phone number records on,
 * so a test reads both through `sentSmsMessages()`.
 */
export class SimSnsDeliverySms implements SimSnsDeliveryEndpoints {
  private readonly optOutList: SimSnsOptOutList;
  private readonly sent: SimSnsSentSmsStore;

  constructor(properties: SimSnsDeliverySmsProperties) {
    this.optOutList = properties.optOutList;
    this.sent = properties.sent;
  }

  /**
   * Record one message as an SMS to the number its subscription names.
   *
   * The body is the message as it was published. The envelope and the subject
   * are left off, because a handset receives the text and nothing else: real
   * SNS sends the envelope to a queue and puts a subject on an email.
   *
   * A subscriber on the opt-out list is recorded as suppressed rather than
   * refused, which is what a publish straight to an opted-out number does. The
   * publish succeeds and the topic's other subscriptions receive theirs.
   */
  deliver(request: SimSnsDeliveryRequest): Promise<void> {
    const phoneNumber = SimSnsPhoneNumber.of(
      request.subscription.endpoint.value,
    );

    this.sent.add(
      new SimSnsSentSmsMessage({
        // The published message's id, so every SMS one publish fanned out is
        // recorded under the id the publisher was answered with.
        messageId: request.message.messageId,
        phoneNumber: phoneNumber.value,
        message: request.message.body.value,
        attributes: request.message.attributes,
        suppressed: this.optOutList.isOptedOut(phoneNumber),
        sentDate: request.message.publishedAt,
        topicArn: request.subscription.topicArn,
        subscriptionArn: request.subscription.arn.value,
      }),
    );

    return Promise.resolve();
  }
}
