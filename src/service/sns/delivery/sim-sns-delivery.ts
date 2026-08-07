import type { SimSnsPublishedMessage } from "../message/sim-sns-published-message.js";
import type { SimSnsSubscription } from "../subscription/sim-sns-subscription.js";
import type { SimSnsNotification } from "./sim-sns-notification.js";

/**
 * The service principal simulated SNS reaches another service as.
 *
 * This is the principal a destination's resource policy has to admit, which is
 * why a queue subscribed to a topic needs `sns.amazonaws.com` in its policy and
 * a function needs it in an `AddPermission` grant.
 */
export const simSnsServicePrincipal = "sns.amazonaws.com";

/**
 * One message on its way from a topic to a subscription's endpoint.
 *
 * The notification comes along signed, because the signature is over the
 * message rather than over the destination. What each protocol makes of it is
 * the endpoint's own business: a queue receives it as an envelope, and a Lambda
 * function receives it inside an event record.
 */
export interface SimSnsDeliveryRequest {
  readonly subscription: SimSnsSubscription;
  readonly message: SimSnsPublishedMessage;
  readonly topicOwnerAccountId: string;
  readonly notification: SimSnsNotification;
}

/**
 * Somewhere a simulated topic can deliver a published message.
 *
 * There is one implementation per protocol, because what a destination is asked
 * and what it is handed differ by protocol: a second protocol adds a second
 * implementation rather than a branch in an existing one.
 * `SimSnsProtocolDeliveryEndpoints` is what picks between them.
 */
export interface SimSnsDeliveryEndpoints {
  /**
   * Deliver one message, refusing if the endpoint does not admit SNS.
   */
  deliver(request: SimSnsDeliveryRequest): Promise<void>;
}

/**
 * What a destination's policy is asked about, as IAM condition values.
 *
 * A destination is admitting one topic rather than SNS at large, so every
 * endpoint supplies these two: the topic as `aws:SourceArn`, and the Account
 * owning it as `aws:SourceAccount`.
 */
export interface SimSnsDeliverySource {
  readonly sourceArn: string;
  readonly sourceAccount: string;
}

/**
 * Which topic a delivery is being made for, and whose it is.
 */
export function simSnsDeliverySource(
  request: SimSnsDeliveryRequest,
): SimSnsDeliverySource {
  return {
    sourceArn: request.subscription.topicArn,
    sourceAccount: request.topicOwnerAccountId,
  };
}
