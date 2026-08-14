import type { SimSchedulerSchedule } from "../../schedule/sim-scheduler-schedule.js";
import { SimSchedulerScheduleState } from "../../schedule/sim-scheduler-schedule-state.js";
import type { SimListSchedulesCommandInput } from "./schedule.command.js";

/**
 * The schedules of a group a listing reports, narrowed by what it asked for.
 *
 * A `State` the request cannot mean is refused rather than matching nothing, so
 * a typo comes back as a validation failure and not as an empty listing.
 */
export function narrowedSchedules(
  schedules: readonly SimSchedulerSchedule[],
  groupName: string,
  input: SimListSchedulesCommandInput,
): readonly SimSchedulerSchedule[] {
  const state =
    input.State === undefined
      ? undefined
      : SimSchedulerScheduleState.of(input.State).value;

  return schedules.filter(
    (schedule) =>
      schedule.groupName === groupName &&
      (input.NamePrefix === undefined ||
        schedule.name.value.startsWith(input.NamePrefix)) &&
      (state === undefined || schedule.state.value === state),
  );
}
