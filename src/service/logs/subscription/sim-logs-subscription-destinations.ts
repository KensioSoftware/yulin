import { SimLogsUnsupportedOperationException } from "../error/sim-logs.error.js";
import type { SimLogsSubscriptionDelivery } from "./sim-logs-subscription-event.js";

/**
 * Where a subscription filter delivers to.
 */
export interface SimLogsSubscriptionDestinations {
  /**
   * Check a destination can be delivered to, before a filter is put on it.
   *
   * Real CloudWatch Logs does this at `PutSubscriptionFilter`: a destination
   * it cannot invoke fails the call rather than silently dropping every event
   * from then on. That is worth keeping, because a subscription that accepts
   * the configuration and delivers nothing is the hardest kind of thing to
   * find.
   */
  check(destinationArn: string): Promise<void>;

  /**
   * Deliver matched events to a destination.
   */
  deliver(
    destinationArn: string,
    delivery: SimLogsSubscriptionDelivery,
  ): Promise<void>;
}

/**
 * The destinations a simulated CloudWatch Logs built on its own can reach,
 * which is none.
 *
 * A standalone SimLogs has no other simulated services to deliver to, and owns
 * its own background scheduler, so nothing could wait for a delivery it made
 * even if it could make one. Holding a filter still works, since that takes
 * nothing but CloudWatch Logs: it is delivery that is refused.
 */
export class SimLogsNoSubscriptionDestinations implements SimLogsSubscriptionDestinations {
  /**
   * Refuse every destination, explaining how to get one.
   */
  check(destinationArn: string): Promise<void> {
    return Promise.reject(this.refusal(destinationArn));
  }

  /**
   * Refuse every delivery, explaining how to get one.
   */
  deliver(destinationArn: string): Promise<void> {
    return Promise.reject(this.refusal(destinationArn));
  }

  private refusal(destinationArn: string): Error {
    return new SimLogsUnsupportedOperationException(
      `Cannot deliver to ${destinationArn}: this SimLogs was constructed on ` +
        `its own, so it has no other simulated services to deliver to and no ` +
        `shared background scheduler to deliver on. Reach simulated ` +
        `CloudWatch Logs through SimAws to deliver to a function.`,
    );
  }
}
