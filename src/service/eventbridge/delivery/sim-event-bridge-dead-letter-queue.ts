import type { SimAwsAccountRegionContainer } from "../../aws/sim-aws-account-region-scope.js";
import { simEventBridgeDeadLetterAttributes } from "./sim-event-bridge-dead-letter-attributes.js";
import {
  type SimEventBridgeDeadLetterRequest,
  simEventBridgeDeliverySource,
} from "./sim-event-bridge-delivery.js";
import { sendEventBridgeQueueMessage } from "./sim-event-bridge-queue-message.js";

interface SimEventBridgeDeadLetterQueueProperties {
  readonly scope: SimAwsAccountRegionContainer;
}

/**
 * A target's dead-letter queue, in the Account and Region its ARN names.
 *
 * The message body is the event, as JSON, whatever `Input` the target had.
 * The message attributes say which rule and target gave up on it, and why.
 */
export class SimEventBridgeDeadLetterQueue {
  private readonly scope: SimAwsAccountRegionContainer;

  constructor(properties: SimEventBridgeDeadLetterQueueProperties) {
    this.scope = properties.scope;
  }

  /**
   * Put an event EventBridge gave up on onto the queue, if it admits
   * EventBridge for this rule.
   */
  async deliver(
    request: SimEventBridgeDeadLetterRequest,
    queue: { readonly name: string; readonly arn: string },
  ): Promise<void> {
    await sendEventBridgeQueueMessage(this.scope, {
      queueName: queue.name,
      queueArn: queue.arn,
      body: JSON.stringify(request.delivery.event.toEnvelope()),
      attributes: simEventBridgeDeadLetterAttributes(request),
      source: simEventBridgeDeliverySource(request.delivery),
    });
  }
}
