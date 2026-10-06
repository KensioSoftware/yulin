import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimRandom } from "../../../util/random/sim-random.js";
import type { SimSchedulerTargetDelivery } from "../delivery/sim-scheduler-target-delivery.js";
import type { SimSchedulerSchedule } from "./sim-scheduler-schedule.js";
import { SimSchedulerPendingOccurrences } from "./sim-scheduler-pending-occurrences.js";
import type { SimSchedulerScheduleStore } from "./sim-scheduler-schedule-store.js";

interface SimSchedulerSchedulesProperties {
  readonly schedules: SimSchedulerScheduleStore;
  readonly delivery: SimSchedulerTargetDelivery;
  readonly background: BackgroundScheduler;

  /** Where each occurrence's moment inside a flexible window is drawn. */
  readonly random: SimRandom;
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
 *
 * A schedule with a flexible time window is armed for each due instant all
 * the same, and then invokes its target at a moment drawn inside the window.
 * The next occurrence is armed from the due instant rather than from the
 * invocation, so the window delays each invocation without moving the
 * schedule.
 */
export class SimSchedulerSchedules {
  private readonly schedules: SimSchedulerScheduleStore;
  private readonly delivery: SimSchedulerTargetDelivery;
  private readonly background: BackgroundScheduler;
  private readonly random: SimRandom;
  private readonly pending = new SimSchedulerPendingOccurrences();

  constructor(properties: SimSchedulerSchedulesProperties) {
    this.schedules = properties.schedules;
    this.delivery = properties.delivery;
    this.background = properties.background;
    this.random = properties.random;
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
      this.occur(schedule, due);

      return Promise.resolve();
    });
  }

  /**
   * Handle a schedule that has fallen due: arm the next occurrence, and
   * invoke the target at the moment its time window gives this one.
   */
  private occur(schedule: SimSchedulerSchedule, due: Date): void {
    if (this.isStale(schedule)) {
      return;
    }

    const last = schedule.schedule.nextAfter(due) === undefined;

    if (!last) {
      this.armAfter(schedule, due);
    }

    const at = schedule.timeWindow.invocationAt(due, this.random);

    this.pending.begin(schedule);

    if (at.getTime() === due.getTime()) {
      this.fire(schedule, due, last);

      return;
    }

    this.background.scheduleAt(at, () => {
      this.fire(schedule, due, last);

      return Promise.resolve();
    });
  }

  /**
   * Invoke a schedule's target for one occurrence.
   *
   * A schedule deleted or replaced while its occurrence waited inside the
   * window is not invoked. The delivery carries the due instant rather than
   * the moment it was made, since that is the occurrence it belongs to. A
   * schedule completes with whichever occurrence is invoked last, which need
   * not be its last due instant when windows overlap.
   */
  private fire(schedule: SimSchedulerSchedule, due: Date, last: boolean): void {
    const completed = this.pending.end(schedule, last);

    if (this.isStale(schedule)) {
      return;
    }

    const invoked = schedule.state.isEnabled;

    if (invoked) {
      this.background.schedule(async () => {
        await this.delivery.deliver({ schedule, at: due });
      });
    }

    if (completed) {
      this.completed(schedule, invoked);
    }
  }

  /**
   * Whether a schedule has been deleted or replaced since it was armed.
   */
  private isStale(schedule: SimSchedulerSchedule): boolean {
    return (
      this.schedules.find(schedule.groupName, schedule.name.value) !== schedule
    );
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
