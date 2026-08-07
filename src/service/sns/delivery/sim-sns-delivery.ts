import type { SimSnsSqsMessageAttribute } from "../message/sim-sns-message-attributes.js";

/**
 * The service principal simulated SNS reaches another service as.
 *
 * This is the principal a destination's resource policy has to admit, which is
 * why a queue subscribed to a topic needs `sns.amazonaws.com` in its policy.
 */
export const simSnsServicePrincipal = "sns.amazonaws.com";

/**
 * One message on its way from a topic to a subscription's endpoint.
 *
 * The body is already whichever form the subscription asked for, since which
 * one it is is the subscription's business rather than the endpoint's. The
 * attributes are only carried for raw delivery: an envelope has them inside it.
 */
export interface SimSnsDeliveryRequest {
  readonly endpointArn: string;
  readonly topicArn: string;
  readonly topicOwnerAccountId: string;
  readonly body: string;
  readonly messageAttributes?:
    Readonly<Record<string, SimSnsSqsMessageAttribute>> | undefined;
}

/**
 * Somewhere a simulated topic can deliver a published message.
 *
 * There is one implementation, for a queue, because `sqs` is the only protocol
 * simulated. A second protocol adds a second implementation rather than a
 * branch in this one.
 */
export interface SimSnsDeliveryEndpoints {
  /**
   * Deliver one message, refusing if the endpoint does not admit SNS.
   */
  deliver(request: SimSnsDeliveryRequest): Promise<void>;
}
