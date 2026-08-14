import { SimEventBridgeTargetNotFound } from "../error/sim-event-bridge-delivery.error.js";
import type {
  SimEventBridgeDeliveryRequest,
  SimEventBridgeDeliveryTargets,
} from "./sim-event-bridge-delivery.js";

/**
 * The targets of a simulated EventBridge built on its own, which are none.
 *
 * A queue, topic or function in another simulated service is only reachable
 * through SimAws, so a `SimEventBridge` constructed directly has nowhere to
 * deliver. Every delivery is recorded as a failure saying so, rather than
 * quietly succeeding, because a rule that appears to have delivered to a
 * target that was never reachable is the worst of the possible answers.
 */
export class SimEventBridgeNoDeliveryTargets implements SimEventBridgeDeliveryTargets {
  /**
   * Refuse the delivery, saying why there was nowhere to make it.
   */
  deliver(request: SimEventBridgeDeliveryRequest): Promise<void> {
    return Promise.reject(
      new SimEventBridgeTargetNotFound(
        `This simulated EventBridge has no targets to deliver to, so ` +
          `${request.target.arn.value} was not reached. Reach EventBridge ` +
          `through SimAws for a rule that delivers.`,
      ),
    );
  }
}
