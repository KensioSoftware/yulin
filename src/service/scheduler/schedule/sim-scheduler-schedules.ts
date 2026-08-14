import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimSchedulerTargetDelivery } from "../delivery/sim-scheduler-target-delivery.js";
import type { SimSchedulerSchedule } from "./sim-scheduler-schedule.js";
import type { SimSchedulerScheduleStore } from "./sim-scheduler-schedule-store.js";

interface SimSchedulerSchedulesProperties {
  readonly schedules: SimSchedulerScheduleStore;
  readonly delivery: SimSchedulerTargetDelivery;
  readonly background: BackgroundScheduler;
}

/**
 * What makes a schedule fire, which is simulated time reaching it.
 *
 * Nothing here runs on the host's clock. A schedule is armed for its next due
 * instant on the simulation's own clock, so it fires when a test advances time
 * past that instant and never otherwise. Advancing an hour with a
 * `rate(1 minute)` schedule therefore invokes the target sixty times, at sixty
 * distinct simulated instants, because each firing arms the next before the
 * walk through the interval moves on.
 *
 * A schedule that has been deleted, or replaced by an update, is no longer the
 * schedule its store holds under that name, and that is what stops it: there is
 * no timer to cancel, only a firing that finds itself out of date. That is also
 * what makes an update reschedule from the new expression rather than keeping
 * the old due times, since an update stores a new schedule and arms it.
 */
export class SimSchedulerSchedules {
  private readonly schedules: SimSchedulerScheduleStore;
  private readonly delivery: SimSchedulerTargetDelivery;
  private readonly background: BackgroundScheduler;

  constructor(properties: SimSchedulerSchedulesProperties) {
    this.schedules = properties.schedules;
    this.delivery = properties.delivery;
    this.background = properties.background;
  }

  /**
   * Start a schedule, from now.
   *
   * A rate runs from the moment the schedule was created, as it does on real
   * AWS, and a one-time `at(...)` already in the past is never armed at all.
   */
  arm(schedule: SimSchedulerSchedule): void {
    this.armAfter(schedule, this.background.now());
  }

  /**
   * Wait for the next instant a schedule falls due after an instant.
   */
  private armAfter(schedule: SimSchedulerSchedule, from: Date): void {
    const due = schedule.schedule.nextAfter(from);

    if (due === undefined) {
      return;
    }

    this.background.scheduleAt(due, () => {
      this.fire(schedule, due);

      return Promise.resolve();
    });
  }

  /**
   * Fire a schedule that has fallen due, and arm it for the next time.
   */
  private fire(schedule: SimSchedulerSchedule, due: Date): void {
    if (
      this.schedules.find(schedule.groupName, schedule.name.value) !== schedule
    ) {
      return;
    }

    const invoked = schedule.state.isEnabled;

    if (invoked) {
      this.background.schedule(async () => {
        await this.delivery.deliver({ schedule, at: due });
      });
    }

    if (schedule.schedule.nextAfter(due) !== undefined) {
      this.armAfter(schedule, due);

      return;
    }

    this.completed(schedule, invoked);
  }

  /**
   * Deal with a schedule that has no next occurrence.
   *
   * `ActionAfterCompletion` is the reason this is worth having: a one-time
   * schedule left at the default `NONE` stays in the Account after it has
   * fired, counting against the quota and turning up in listings, which
   * surprises people who expected it to clean up after itself.
   *
   * A schedule that never invoked anything has not completed. One that was
   * disabled when its only instant went past is still there afterwards, which
   * is what AWS does: the action is what happens after the target is invoked,
   * and nothing was.
   */
  private completed(schedule: SimSchedulerSchedule, invoked: boolean): void {
    if (invoked && schedule.actionAfterCompletion === "DELETE") {
      this.schedules.remove(schedule);
    }
  }
}
