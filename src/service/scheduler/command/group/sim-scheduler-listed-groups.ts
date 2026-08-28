import type { SimSchedulerScheduleGroup } from "../../group/sim-scheduler-schedule-group.js";
import type { SimListScheduleGroupsCommandInput } from "./group.command.js";

/**
 * The groups a listing reports, narrowed by what it asked for.
 */
export function narrowedScheduleGroups(
  groups: readonly SimSchedulerScheduleGroup[],
  input: SimListScheduleGroupsCommandInput,
): readonly SimSchedulerScheduleGroup[] {
  const prefix = input.NamePrefix;

  if (prefix === undefined) {
    return groups;
  }

  return groups.filter((group) => group.name.startsWith(prefix));
}
