import type {
  SimSchedulerDeliveryRequest,
  SimSchedulerDeliveryTargets,
} from "./sim-scheduler-delivery.js";
import type { BackgroundScheduler } from "../../../util/background/background.js";
import { SimSchedulerDeliveryAttempt } from "./sim-scheduler-delivery-attempt.js";
import {
  type SimSchedulerDeliveryFailure,
  SimSchedulerDeliveryFailures,
} from "./sim-scheduler-delivery-failures.js";

interface SimSchedulerTargetDeliveryProperties {
  readonly endpoints: SimSchedulerDeliveryTargets;
  readonly background: BackgroundScheduler;
}

/**
 * Runs one scheduled invocation through its attempts and keeps final failures.
 *
 * A failure is recorded rather than thrown, because these run as background
 * tasks and one left rejected would fail an unrelated
 * `backgroundTasksComplete()`, or an unrelated `advanceBy(...)`. Real Scheduler
 * has nowhere to report a failed invocation to either.
 */
export class SimSchedulerTargetDelivery {
  private readonly endpoints: SimSchedulerDeliveryTargets;
  private readonly background: BackgroundScheduler;
  private readonly failures = new SimSchedulerDeliveryFailures();

  constructor(properties: SimSchedulerTargetDeliveryProperties) {
    this.endpoints = properties.endpoints;
    this.background = properties.background;
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
    await new SimSchedulerDeliveryAttempt({
      request,
      endpoints: this.endpoints,
      background: this.background,
      record: (error): void => {
        const schedule = request.schedule;

        this.failures.record({
          scheduleName: schedule.name.value,
          scheduleArn: schedule.arn,
          targetArn: schedule.target.arn.value,
          roleArn: schedule.target.roleArn,
          at: request.at,
          error,
        });
      },
    }).start();
  }
}
