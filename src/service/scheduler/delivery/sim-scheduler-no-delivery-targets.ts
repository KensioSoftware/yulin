import { SimSchedulerTargetNotFound } from "../error/sim-scheduler-delivery.error.js";
import type {
  SimSchedulerDeliveryRequest,
  SimSchedulerDeliveryTargets,
} from "./sim-scheduler-delivery.js";

/**
 * The targets of a simulated Scheduler built on its own, which are none.
 *
 * A function, queue or topic in another simulated service is only reachable
 * through SimAws, so a `SimScheduler` constructed directly has nowhere to
 * invoke. Every invocation is recorded as a failure saying so, rather than
 * quietly succeeding, because a schedule that appears to have invoked a target
 * that was never reachable is the worst of the possible answers.
 */
export class SimSchedulerNoDeliveryTargets implements SimSchedulerDeliveryTargets {
  /**
   * Refuse the invocation, saying why there was nowhere to make it.
   */
  deliver(request: SimSchedulerDeliveryRequest): Promise<void> {
    return Promise.reject(
      new SimSchedulerTargetNotFound(
        `This simulated Scheduler has no targets to invoke, so ` +
          `${request.schedule.target.arn.value} was not reached. Reach ` +
          `Scheduler through SimAws for a schedule that invokes.`,
      ),
    );
  }
}
