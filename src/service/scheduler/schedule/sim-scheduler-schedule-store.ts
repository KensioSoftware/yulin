import { SimSchedulerResourceNotFoundException } from "../error/sim-scheduler.error.js";
import type { SimSchedulerSchedule } from "./sim-scheduler-schedule.js";

/**
 * How a schedule is keyed, which is by group as well as by name.
 *
 * A schedule name is unique within its group rather than within the Account,
 * and the group is in the ARN, so the two together are the identity.
 */
function scheduleKey(groupName: string, scheduleName: string): string {
  return `${groupName} ${scheduleName}`;
}

/**
 * The schedules of one simulated Scheduler scope.
 */
export class SimSchedulerScheduleStore {
  private readonly schedules = new Map<string, SimSchedulerSchedule>();

  /**
   * Every schedule in this scope, in creation order.
   */
  get all(): readonly SimSchedulerSchedule[] {
    return this.schedules.values().toArray();
  }

  /**
   * Store a schedule, replacing any of that name in that group.
   *
   * Creating one that already exists is refused before it reaches here, so a
   * replacement is only ever an update.
   */
  put(schedule: SimSchedulerSchedule): void {
    this.schedules.set(
      scheduleKey(schedule.groupName, schedule.name.value),
      schedule,
    );
  }

  /**
   * Find a schedule by group and name.
   */
  find(
    groupName: string,
    scheduleName: string,
  ): SimSchedulerSchedule | undefined {
    return this.schedules.get(scheduleKey(groupName, scheduleName));
  }

  /**
   * Resolve a schedule by group and name, or refuse.
   */
  require(groupName: string, scheduleName: string): SimSchedulerSchedule {
    const found = this.find(groupName, scheduleName);

    if (found === undefined) {
      throw new SimSchedulerResourceNotFoundException(
        `Schedule ${scheduleName} does not exist in group ${groupName}.`,
      );
    }

    return found;
  }

  /**
   * Forget a deleted schedule.
   */
  remove(schedule: SimSchedulerSchedule): void {
    this.schedules.delete(scheduleKey(schedule.groupName, schedule.name.value));
  }
}
