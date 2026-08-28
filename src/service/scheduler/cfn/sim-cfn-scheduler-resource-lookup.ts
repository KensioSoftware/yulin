import type { SimSchedulerScheduleInput } from "../command/schedule/schedule.command.js";
import type { SimSchedulerSchedule } from "../schedule/sim-scheduler-schedule.js";
import type { SimScheduler } from "../sim-scheduler.js";

/**
 * The `AWS::Scheduler::*` Resource types this service creates.
 */
export type SimSchedulerCfnResourceTypeName = "Schedule" | "ScheduleGroup";

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
 * Read the Resource type a request names, refusing one this service does not
 * create.
 *
 * A schedule and a schedule group are the whole of `AWS::Scheduler::*`, so
 * anything else is a type AWS has added since, reported as unsupported rather
 * than quietly treated as deployed.
 */
export function schedulerResourceTypeName(
  resourceTypeName: string,
): SimSchedulerCfnResourceTypeName {
  if (resourceTypeName === "Schedule" || resourceTypeName === "ScheduleGroup") {
    return resourceTypeName;
  }

  throw new Error(
    `Unsupported sim Scheduler CloudFormation Resource ${resourceTypeName}`,
  );
}
