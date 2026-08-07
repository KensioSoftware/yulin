import type { SimSnsDeliveryRequest } from "../sim-sns-delivery.js";
import type { SimSnsNotificationFields } from "../sim-sns-notification.js";

/**
 * What the `EventSource` of an SNS record says, which is how a handler taking
 * events from more than one service tells them apart.
 */
const eventSource = "aws:sns";

/**
 * The version of the SNS record shape, which real SNS has never moved off.
 */
const eventVersion = "1.0";

/**
 * The event one subscribed Lambda function is invoked with.
 *
 * `Records` always holds exactly one entry, even for a `PublishBatch`. Real SNS
 * does not batch to Lambda: each published message is its own asynchronous
 * invocation, so a handler looping over `Records` sees one message per call.
 */
export function simSnsLambdaEventDocument(
  request: SimSnsDeliveryRequest,
): object {
  return {
    Records: [
      {
        EventSource: eventSource,
        EventVersion: eventVersion,
        EventSubscriptionArn: request.subscription.arn.value,
        Sns: snsRecord(request.notification.fields()),
      },
    ],
  };
}

/**
 * The notification as the `Sns` object of a record spells it.
 *
 * Two fields differ from the envelope a queue receives, and the difference is
 * real SNS behaviour rather than an oversight: the envelope has `SigningCertURL`
 * and `UnsubscribeURL`, and a Lambda event has `SigningCertUrl` and
 * `UnsubscribeUrl`. `Subject` and `MessageAttributes` are always present here,
 * where the envelope leaves each out when there is nothing to put in it.
 */
function snsRecord(fields: SimSnsNotificationFields): Record<string, unknown> {
  return {
    Type: fields.type,
    MessageId: fields.messageId,
    TopicArn: fields.topicArn,
    Subject: fields.subject ?? null,
    Message: fields.message,
    Timestamp: fields.timestamp,
    SignatureVersion: fields.signature.SignatureVersion,
    Signature: fields.signature.Signature,
    SigningCertUrl: fields.signature.SigningCertURL,
    UnsubscribeUrl: fields.unsubscribeUrl,
    MessageAttributes: fields.messageAttributes,
  };
}
