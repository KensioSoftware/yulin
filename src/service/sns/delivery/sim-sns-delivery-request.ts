import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimSnsPublishedMessage } from "../message/sim-sns-published-message.js";
import type { SimSnsMessageSigner } from "../signature/sim-sns-message-signer.js";
import type { SimSnsSubscription } from "../subscription/sim-sns-subscription.js";
import type { SimSnsDeliveryRequest } from "./sim-sns-delivery.js";
import { SimSnsEnvelope } from "./sim-sns-envelope.js";

interface SimSnsDeliveryRequestsProperties {
  readonly signer: SimSnsMessageSigner;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * The message on its own, with its attributes alongside it.
 *
 * Raw delivery takes the envelope away, so the message attributes have nowhere
 * to travel but the SQS message itself. A consumer written for raw delivery
 * reads them there.
 */
function rawBody(
  message: SimSnsPublishedMessage,
): Pick<SimSnsDeliveryRequest, "body" | "messageAttributes"> {
  return {
    body: message.body.value,
    messageAttributes: message.attributes.asSqsAttributes(),
  };
}

/**
 * Builds what each subscription of one simulated SNS scope is sent.
 *
 * Which form the body takes is the subscription's business rather than the
 * endpoint's, so it is settled here and the endpoint is handed a body.
 */
export class SimSnsDeliveryRequests {
  private readonly signer: SimSnsMessageSigner;
  private readonly scope: SimAwsAccountRegionScope;

  constructor(properties: SimSnsDeliveryRequestsProperties) {
    this.signer = properties.signer;
    this.scope = properties.accountRegionScope;
  }

  /**
   * What one subscription is being sent for one published message.
   */
  for(
    subscription: SimSnsSubscription,
    message: SimSnsPublishedMessage,
  ): SimSnsDeliveryRequest {
    const named = {
      endpointArn: subscription.endpoint.value,
      topicArn: subscription.topicArn,
      topicOwnerAccountId: this.scope.accountId,
    };

    if (subscription.attributes.rawMessageDelivery) {
      return { ...named, ...rawBody(message) };
    }

    return { ...named, body: this.envelope(subscription, message).body };
  }

  /**
   * The message wrapped in the SNS envelope, which is the default.
   */
  private envelope(
    subscription: SimSnsSubscription,
    message: SimSnsPublishedMessage,
  ): SimSnsEnvelope {
    return new SimSnsEnvelope({
      message,
      subscription,
      regionName: this.scope.regionName,
      signer: this.signer,
    });
  }
}
