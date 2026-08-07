import { jsonStringify } from "../../../util/type-guard/json.js";
import type { SimSnsNotification } from "./sim-sns-notification.js";

interface SimSnsEnvelopeProperties {
  readonly notification: SimSnsNotification;
}

/**
 * The document a subscription receives when it is not asking for raw delivery.
 *
 * Real SNS wraps the published message in this, which is why a consumer written
 * for it reads `JSON.parse(body).Message` rather than `body`. Everything real
 * SNS puts in it is here, including a signature a verifier can actually check.
 *
 * The two URLs are spelled in upper case, which is how real SNS spells them in
 * an envelope. A Lambda event spells the same two fields `SigningCertUrl` and
 * `UnsubscribeUrl`.
 */
export class SimSnsEnvelope {
  private readonly notification: SimSnsNotification;

  constructor(properties: SimSnsEnvelopeProperties) {
    this.notification = properties.notification;
  }

  /**
   * The envelope as the JSON body a queue receives.
   */
  get body(): string {
    return jsonStringify(this.document());
  }

  private document(): Record<string, unknown> {
    const fields = this.notification.fields();

    return {
      Type: fields.type,
      MessageId: fields.messageId,
      TopicArn: fields.topicArn,
      ...(fields.subject !== undefined && { Subject: fields.subject }),
      Message: fields.message,
      Timestamp: fields.timestamp,
      ...fields.signature,
      UnsubscribeURL: fields.unsubscribeUrl,
      ...(fields.hasMessageAttributes && {
        MessageAttributes: fields.messageAttributes,
      }),
    };
  }
}
