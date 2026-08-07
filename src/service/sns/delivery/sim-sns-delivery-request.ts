import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimSnsPublishedMessage } from "../message/sim-sns-published-message.js";
import type { SimSnsMessageSigner } from "../signature/sim-sns-message-signer.js";
import type { SimSnsSubscription } from "../subscription/sim-sns-subscription.js";
import type { SimSnsDeliveryRequest } from "./sim-sns-delivery.js";
import { SimSnsNotification } from "./sim-sns-notification.js";

interface SimSnsDeliveryRequestsProperties {
  readonly signer: SimSnsMessageSigner;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * Builds what each subscription of one simulated SNS scope is sent.
 *
 * The notification is built here rather than at the endpoint, because it is
 * signed with the scope's own key: the signature belongs to the message rather
 * than to the destination. Which document the endpoint makes of it is the
 * endpoint's own business.
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
    return {
      subscription,
      message,
      topicOwnerAccountId: this.scope.accountId,
      notification: new SimSnsNotification({
        message,
        subscription,
        regionName: this.scope.regionName,
        signer: this.signer,
      }),
    };
  }
}
