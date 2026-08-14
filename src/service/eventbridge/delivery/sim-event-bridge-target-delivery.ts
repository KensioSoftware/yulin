import type {
  SimEventBridgeDeliveryRequest,
  SimEventBridgeDeliveryTargets,
} from "./sim-event-bridge-delivery.js";
import type { SimEventBridgeDeliveryFailure } from "./sim-event-bridge-delivery-failures.js";
import { SimEventBridgeDeliveryFailures } from "./sim-event-bridge-delivery-failures.js";

interface SimEventBridgeTargetDeliveryProperties {
  readonly endpoints: SimEventBridgeDeliveryTargets;
}

/**
 * Makes one delivery and keeps whatever went wrong.
 *
 * A failure is recorded rather than thrown, because these run as background
 * tasks and one left rejected would fail an unrelated
 * `backgroundTasksComplete()`. Real EventBridge never reports a delivery
 * failure to the caller who put the event either, so there is nowhere to throw
 * it to.
 */
export class SimEventBridgeTargetDelivery {
  private readonly endpoints: SimEventBridgeDeliveryTargets;
  private readonly failures = new SimEventBridgeDeliveryFailures();

  constructor(properties: SimEventBridgeTargetDeliveryProperties) {
    this.endpoints = properties.endpoints;
  }

  /**
   * Every delivery that could not be made.
   */
  get deliveryFailures(): readonly SimEventBridgeDeliveryFailure[] {
    return this.failures.all;
  }

  /**
   * Send one event to one target.
   */
  async deliver(request: SimEventBridgeDeliveryRequest): Promise<void> {
    try {
      await this.endpoints.deliver(request);
    } catch (error) {
      this.failures.record({
        ruleName: request.ruleName,
        ruleArn: request.ruleArn,
        targetId: request.target.id,
        targetArn: request.target.arn.value,
        eventId: request.event.id,
        error,
      });
    }
  }
}
