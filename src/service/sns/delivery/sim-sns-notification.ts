import type { SimSnsEnvelopeMessageAttribute } from "../message/sim-sns-message-attributes.js";
import type { SimSnsPublishedMessage } from "../message/sim-sns-published-message.js";
import { simSnsUnsubscribeUrl } from "../signature/sim-sns-host.js";
import type {
  SimSnsMessageSigner,
  SimSnsSignatureFields,
} from "../signature/sim-sns-message-signer.js";
import type { SimSnsSubscription } from "../subscription/sim-sns-subscription.js";
import { simSnsCanonicalMessage } from "./sim-sns-canonical-message.js";

/**
 * What a message published to a topic is, as opposed to a subscription
 * confirmation, which is the only other kind of message real SNS delivers.
 */
const notificationType = "Notification";

/**
 * One published message as every destination's document carries it.
 *
 * A queue and a Lambda function are handed the same values with the same
 * signature over them. What differs is how each protocol spells two of the
 * URLs, and whether an absent subject and an empty attribute set are left out,
 * so those belong to the documents rather than here.
 *
 * The names here are the simulator's own rather than either document's, so that
 * neither spelling looks like the right one.
 */
export interface SimSnsNotificationFields {
  readonly type: string;
  readonly messageId: string;
  readonly topicArn: string;
  readonly subject: string | undefined;
  readonly message: string;
  readonly timestamp: string;
  readonly signature: SimSnsSignatureFields;
  readonly unsubscribeUrl: string;
  readonly messageAttributes: Record<string, SimSnsEnvelopeMessageAttribute>;
  readonly hasMessageAttributes: boolean;
}

interface SimSnsNotificationProperties {
  readonly message: SimSnsPublishedMessage;
  readonly subscription: SimSnsSubscription;
  readonly regionName: string;
  readonly signer: SimSnsMessageSigner;
}

/**
 * What one subscription is being told, signed once for whichever document
 * carries it.
 *
 * The fields are kept once they have been built rather than built again per
 * document, so a message that reaches two documents is signed once. Signing is
 * the expensive part of a delivery, and a second signature over the same string
 * would be the same signature anyway.
 */
export class SimSnsNotification {
  private readonly message: SimSnsPublishedMessage;
  private readonly subscription: SimSnsSubscription;
  private readonly regionName: string;
  private readonly signer: SimSnsMessageSigner;

  private held: SimSnsNotificationFields | undefined;

  constructor(properties: SimSnsNotificationProperties) {
    this.message = properties.message;
    this.subscription = properties.subscription;
    this.regionName = properties.regionName;
    this.signer = properties.signer;
  }

  /**
   * The values a delivered document is built out of.
   */
  fields(): SimSnsNotificationFields {
    this.held ??= this.build();

    return this.held;
  }

  private build(): SimSnsNotificationFields {
    const attributes = this.message.attributes;
    const subject = this.message.subject?.value;
    const timestamp = this.message.publishedAt.toISOString();
    const topicArn = this.subscription.topicArn;
    const message = this.message.body.value;
    const messageId = this.message.messageId;

    return {
      type: notificationType,
      messageId,
      topicArn,
      subject,
      message,
      timestamp,
      signature: this.signer.sign(
        simSnsCanonicalMessage({
          Message: message,
          MessageId: messageId,
          Subject: subject,
          Timestamp: timestamp,
          TopicArn: topicArn,
          Type: notificationType,
        }),
      ),
      unsubscribeUrl: simSnsUnsubscribeUrl(
        this.regionName,
        this.subscription.arn.value,
      ),
      messageAttributes: attributes.inEnvelope(),
      hasMessageAttributes: !attributes.isEmpty,
    };
  }
}
