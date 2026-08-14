import type {
  SimSchedulerDeliveryRequest,
  SimSchedulerDeliveryTargets,
} from "./sim-scheduler-delivery.js";
import {
  type SimSchedulerDeliveryFailure,
  SimSchedulerDeliveryFailures,
} from "./sim-scheduler-delivery-failures.js";

interface SimSchedulerTargetDeliveryProperties {
  readonly endpoints: SimSchedulerDeliveryTargets;
}

/**
 * Makes one invocation and keeps whatever went wrong.
 *
 * A failure is recorded rather than thrown, because these run as background
 * tasks and one left rejected would fail an unrelated
 * `backgroundTasksComplete()`, or an unrelated `advanceBy(...)`. Real Scheduler
 * has nowhere to report a failed invocation to either.
 */
export class SimSchedulerTargetDelivery {
  private readonly endpoints: SimSchedulerDeliveryTargets;
  private readonly failures = new SimSchedulerDeliveryFailures();

  constructor(properties: SimSchedulerTargetDeliveryProperties) {
    this.endpoints = properties.endpoints;
  }

  /**
   * Every invocation that could not be made.
   */
  get deliveryFailures(): readonly SimSchedulerDeliveryFailure[] {
    return this.failures.all;
  }

  /**
   * Invoke one schedule's target.
   */
  async deliver(request: SimSchedulerDeliveryRequest): Promise<void> {
    try {
      await this.endpoints.deliver(request);
    } catch (error) {
      const schedule = request.schedule;

      this.failures.record({
        scheduleName: schedule.name.value,
        scheduleArn: schedule.arn,
        targetArn: schedule.target.arn.value,
        roleArn: schedule.target.roleArn,
        at: request.at,
        error,
      });
    }
  }
}
