import type { SimSchedulerScheduleInput } from "../command/schedule/schedule.command.js";
import type { SimSchedulerSchedule } from "../schedule/sim-scheduler-schedule.js";
import type { SimScheduler } from "../sim-scheduler.js";

/**
 * Find the schedule a Resource just created, in whichever group it went into.
 *
 * The group is left out of the lookup when the template named none, so the
 * default the service itself picks is the one used, rather than this having a
 * second opinion about what that default is.
 */
export function createdSchedule(
  scheduler: SimScheduler,
  input: SimSchedulerScheduleInput,
): SimSchedulerSchedule | undefined {
  const name = input.Name;

  if (name === undefined) {
    return undefined;
  }

  return input.GroupName === undefined
    ? scheduler.findSchedule(name)
    : scheduler.findSchedule(name, input.GroupName);
}

/**
 * Refuse a Resource type this service does not create.
 *
 * Schedule groups are the other `AWS::Scheduler::*` type, and are reported as
 * unsupported rather than quietly treated as deployed.
 */
export function refuseUnknownType(resourceTypeName: string): void {
  if (resourceTypeName !== "Schedule") {
    throw new Error(
      `Unsupported sim Scheduler CloudFormation Resource ${resourceTypeName}`,
    );
  }
}
