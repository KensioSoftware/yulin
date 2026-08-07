import { SimSnsUnsimulatedInputException } from "../error/sim-sns.error.js";
import type {
  SimSnsDeliveryEndpoints,
  SimSnsDeliveryRequest,
} from "./sim-sns-delivery.js";

/**
 * The endpoints a simulated SNS built on its own can reach, which is none.
 *
 * A standalone SimSns has no other simulated services to reach, and owns its
 * own background scheduler, so nothing could wait for a delivery it made even
 * if it could make one. Subscriptions still work, since holding them takes
 * nothing but SNS: it is delivery that is refused, and the refusal is recorded
 * as a delivery failure like any other.
 */
export class SimSnsNoDeliveryEndpoints implements SimSnsDeliveryEndpoints {
  /**
   * Refuse every delivery, explaining how to get one.
   */
  deliver(request: SimSnsDeliveryRequest): never {
    throw new SimSnsUnsimulatedInputException(
      `Cannot deliver to ${request.subscription.endpoint.value}: this SimSns ` +
        "was constructed on its own, so it has no other simulated services to " +
        "deliver to and no shared background scheduler to deliver on. Reach " +
        "simulated SNS through SimAws to deliver a published message to a " +
        "queue or a function.",
    );
  }
}
