import type { SimSchedulerSchedule } from "./sim-scheduler-schedule.js";

/**
 * The occurrences of each schedule that have fallen due and are waiting
 * inside a flexible window to be invoked.
 *
 * A window longer than the gap between due instants lets occurrences overlap,
 * and a finite schedule's last occurrence can then be invoked before an
 * earlier one. The schedule has completed once its last occurrence has fallen
 * due and nothing is left waiting.
 */
export class SimSchedulerPendingOccurrences {
  private readonly waiting = new Map<SimSchedulerSchedule, number>();
  private readonly lastFallenDue = new Set<SimSchedulerSchedule>();

  /**
   * Note an occurrence that has fallen due and will be invoked later.
   */
  begin(schedule: SimSchedulerSchedule): void {
    this.waiting.set(schedule, (this.waiting.get(schedule) ?? 0) + 1);
  }

  /**
   * Note an occurrence that has been invoked, or given up on, and answer
   * whether the schedule has now completed.
   */
  end(schedule: SimSchedulerSchedule, last: boolean): boolean {
    const remaining = (this.waiting.get(schedule) ?? 1) - 1;

    this.waiting.set(schedule, remaining);

    if (last) {
      this.lastFallenDue.add(schedule);
    }

    if (remaining > 0 || !this.lastFallenDue.has(schedule)) {
      return false;
    }

    this.waiting.delete(schedule);
    this.lastFallenDue.delete(schedule);

    return true;
  }
}
