import type { BackgroundScheduler } from "../../../../util/background/background.js";
import {
  assertSimSnsMessageWithinLimit,
  SimSnsPublishedMessage,
} from "../../message/sim-sns-published-message.js";
import type { SimSnsOptOutList } from "../../sms/sim-sns-opt-out-list.js";
import { SimSnsPhoneNumber } from "../../sms/sim-sns-phone-number.js";
import { SimSnsSentSmsMessage } from "../../sms/sim-sns-sent-sms-message.js";
import type { SimSnsSentSmsStore } from "../../sms/sim-sns-sent-sms-store.js";
import type { SimSnsRequestOptions } from "../sim-sns-request-options.js";
import type { SimSnsTopicAccess } from "../topic/sim-sns-topic-access.js";
import { simSnsPublishedMessageInput } from "./sim-sns-publish-input.js";
import type {
  SimPublishCommandInput,
  SimPublishCommandOutput,
} from "./publish.command.js";

/**
 * Real SNS authorizes an SMS publish as `sns:Publish` against `*`, since there
 * is no topic in the request for a policy to name.
 */
const publishAction = "sns:Publish";

interface SimSnsPublishSmsProperties {
  readonly access: SimSnsTopicAccess;
  readonly clock: BackgroundScheduler;
  readonly optOutList: SimSnsOptOutList;
  readonly sent: SimSnsSentSmsStore;
}

/**
 * Publishing straight to a phone number.
 *
 * This is the half of `Publish` that reaches no topic. Real SNS hands the
 * message to a carrier and tells the publisher a message id, and the publisher
 * hears nothing more about it. There is no carrier here to hand it to. The
 * message is recorded, and the publisher gets the same message id it would
 * have got on AWS.
 */
export class SimSnsPublishSms {
  private readonly access: SimSnsTopicAccess;
  private readonly clock: BackgroundScheduler;
  private readonly optOutList: SimSnsOptOutList;
  private readonly sent: SimSnsSentSmsStore;

  constructor(properties: SimSnsPublishSmsProperties) {
    this.access = properties.access;
    this.clock = properties.clock;
    this.optOutList = properties.optOutList;
    this.sent = properties.sent;
  }

  /**
   * Publish one SMS to a phone number.
   *
   * A number on the opt-out list still gets a message id, because that is what
   * real SNS answers a publish it accepts and then delivers nowhere. The
   * record says the opt-out list stopped it.
   */
  publish(
    input: SimPublishCommandInput,
    options?: SimSnsRequestOptions,
  ): SimPublishCommandOutput {
    this.access.authorizeAnyTopic(publishAction, options);

    const phoneNumber = SimSnsPhoneNumber.of(input.PhoneNumber);
    const message = SimSnsPublishedMessage.of(
      simSnsPublishedMessageInput(input),
      this.clock.now(),
    );

    assertSimSnsMessageWithinLimit(message.byteSize);

    this.sent.add(
      new SimSnsSentSmsMessage({
        messageId: message.messageId,
        phoneNumber: phoneNumber.value,
        message: message.body.value,
        attributes: message.attributes,
        suppressed: this.optOutList.isOptedOut(phoneNumber),
        sentDate: message.publishedAt,
      }),
    );

    return { $metadata: {}, MessageId: message.messageId };
  }
}
