import type { SimSchedulerScheduleGroup } from "./group/sim-scheduler-schedule-group.js";
import type { SimSchedulerScheduleGroupStore } from "./group/sim-scheduler-schedule-group-store.js";
import { defaultScheduleGroupName } from "./schedule/sim-scheduler-schedule-name.js";
import type { SimSchedulerSchedule } from "./schedule/sim-scheduler-schedule.js";
import type { SimSchedulerScheduleStore } from "./schedule/sim-scheduler-schedule-store.js";

/**
 * What a test can ask a simulated Scheduler about its own state.
 *
 * These are the simulator's own accessors rather than simulated API operations:
 * they go through no Command and no authorization. They are held apart from the
 * facade for the same reason SimAws holds its service accessors apart, which is
 * that the facade's job is delegating SDK commands and this is a different job
 * that happens to live on the same object.
 */
export abstract class SimSchedulerInspection {
  protected abstract readonly scheduleStore: SimSchedulerScheduleStore;
  protected abstract readonly groupStore: SimSchedulerScheduleGroupStore;

  /**
   * Find a schedule by name, in a group.
   *
   * This is the simulator's own accessor, for tests inspecting schedule state
   * without going through a Command and its authorization.
   */
  findSchedule(
    scheduleName: string,
    groupName = defaultScheduleGroupName,
  ): SimSchedulerSchedule | undefined {
    return this.scheduleStore.find(groupName, scheduleName);
  }

  /**
   * Every schedule this scope holds, in creation order.
   */
  get allSchedules(): readonly SimSchedulerSchedule[] {
    return this.scheduleStore.all;
  }

  /**
   * Find a schedule group by name.
   */
  findScheduleGroup(groupName: string): SimSchedulerScheduleGroup | undefined {
    return this.groupStore.find(groupName);
  }

  /**
   * Every schedule group this scope holds, in creation order.
   *
   * `default` is always the first of them, since every Account has it without
   * anyone creating one.
   */
  get allScheduleGroups(): readonly SimSchedulerScheduleGroup[] {
    return this.groupStore.all;
  }
}
