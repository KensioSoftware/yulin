import type { SimAwsAccountRegionContainer } from "../../aws/sim-aws-account-region-scope.js";
import {
  type SimEventBridgeDeliveryRequest,
  simEventBridgeDeliveryJson,
  simEventBridgeDeliverySource,
} from "./sim-event-bridge-delivery.js";
import { sendEventBridgeQueueMessage } from "./sim-event-bridge-queue-message.js";

interface SimEventBridgeDeliveryQueueProperties {
  readonly scope: SimAwsAccountRegionContainer;
}

/**
 * A queue a simulated rule is sending an event to, in the Account and Region
 * the target ARN names.
 *
 * The message body is the event, as JSON. Real EventBridge puts the event
 * itself on the queue rather than wrapping it in an envelope of its own, which
 * is what makes a queue target simpler to consume than an SNS subscription.
 */
export class SimEventBridgeDeliveryQueue {
  private readonly scope: SimAwsAccountRegionContainer;

  constructor(properties: SimEventBridgeDeliveryQueueProperties) {
    this.scope = properties.scope;
  }

  /**
   * Put the event on the queue, if it admits EventBridge for this rule.
   */
  async deliver(request: SimEventBridgeDeliveryRequest): Promise<void> {
    await sendEventBridgeQueueMessage(this.scope, {
      queueName: request.target.arn.resource,
      queueArn: request.target.arn.value,
      body: simEventBridgeDeliveryJson(request),
      source: simEventBridgeDeliverySource(request),
    });
  }
}
