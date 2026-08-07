import { jsonStringify } from "../../../util/type-guard/json.js";
import type { SimSnsPublishedMessage } from "../message/sim-sns-published-message.js";
import { simSnsUnsubscribeUrl } from "../signature/sim-sns-host.js";
import type { SimSnsMessageSigner } from "../signature/sim-sns-message-signer.js";
import type { SimSnsSubscription } from "../subscription/sim-sns-subscription.js";

/**
 * What a message published to a topic is, as opposed to a subscription
 * confirmation, which is the only other kind of message real SNS delivers.
 */
const notificationType = "Notification";

interface SimSnsEnvelopeProperties {
  readonly message: SimSnsPublishedMessage;
  readonly subscription: SimSnsSubscription;
  readonly regionName: string;
  readonly signer: SimSnsMessageSigner;
}

/**
 * The document a subscription receives when it is not asking for raw delivery.
 *
 * Real SNS wraps the published message in this, which is why a consumer written
 * for it reads `JSON.parse(body).Message` rather than `body`. Everything real
 * SNS puts in it is here, including a signature a verifier can actually check.
 */
export class SimSnsEnvelope {
  private readonly message: SimSnsPublishedMessage;
  private readonly subscription: SimSnsSubscription;
  private readonly regionName: string;
  private readonly signer: SimSnsMessageSigner;

  constructor(properties: SimSnsEnvelopeProperties) {
    this.message = properties.message;
    this.subscription = properties.subscription;
    this.regionName = properties.regionName;
    this.signer = properties.signer;
  }

  /**
   * The envelope as the JSON body a queue receives.
   */
  get body(): string {
    return jsonStringify(this.document());
  }

  /**
   * The string real SNS signs, which is what a verifier rebuilds to check the
   * signature.
   *
   * Each signed field is its name and its value, both followed by a newline.
   * The message attributes are not signed, here or on real AWS, so changing one
   * in flight leaves the signature valid.
   */
  canonicalMessage(): string {
    const parts: string[] = [];

    for (const [name, value] of this.signedFields()) {
      if (value !== undefined) {
        parts.push(`${name}\n${value}\n`);
      }
    }

    return parts.join("");
  }

  /**
   * The fields the signature covers, in the order it covers them.
   *
   * They are pairs rather than an object because the order is the signature's
   * business: it is the alphabetical order of the field names, and rebuilding
   * the string in any other order fails to verify.
   */
  private signedFields(): readonly (readonly [string, string | undefined])[] {
    return [
      ["Message", this.message.body.value],
      ["MessageId", this.message.messageId],
      ["Subject", this.message.subject?.value],
      ["Timestamp", this.message.publishedAt.toISOString()],
      ["TopicArn", this.subscription.topicArn],
      ["Type", notificationType],
    ];
  }

  private document(): Record<string, unknown> {
    const attributes = this.message.attributes;

    return {
      Type: notificationType,
      MessageId: this.message.messageId,
      TopicArn: this.subscription.topicArn,
      ...(this.message.subject !== undefined && {
        Subject: this.message.subject.value,
      }),
      Message: this.message.body.value,
      Timestamp: this.message.publishedAt.toISOString(),
      ...this.signer.sign(this.canonicalMessage()),
      UnsubscribeURL: simSnsUnsubscribeUrl(
        this.regionName,
        this.subscription.arn.value,
      ),
      ...(!attributes.isEmpty && {
        MessageAttributes: attributes.inEnvelope(),
      }),
    };
  }
}
