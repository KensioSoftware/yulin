import type { SimSchedulerSchedule } from "../../schedule/sim-scheduler-schedule.js";
import type {
  SimGetScheduleCommandOutput,
  SimSchedulerListedSchedule,
} from "./schedule.command.js";

/**
 * One schedule as GetSchedule reports it.
 *
 * The expression comes back as the string it was created with rather than a
 * re-serialised version of it, so a caller comparing what they read against
 * what they sent sees what they sent. `FlexibleTimeWindow` always reports `OFF`
 * because that is the only mode this simulation takes.
 */
export function describedSchedule(
  schedule: SimSchedulerSchedule,
): Omit<SimGetScheduleCommandOutput, "$metadata"> {
  return {
    Arn: schedule.arn,
    Name: schedule.name.value,
    GroupName: schedule.groupName,
    ScheduleExpression: schedule.schedule.source,
    State: schedule.state.value,
    Description: schedule.description,
    ActionAfterCompletion: schedule.actionAfterCompletion,
    FlexibleTimeWindow: { Mode: "OFF" },
    Target: {
      Arn: schedule.target.arn.value,
      RoleArn: schedule.target.roleArn,
      Input: schedule.target.input,
      EcsParameters: schedule.target.task?.parameters.declared,
    },
    CreationDate: schedule.creationDate,
    LastModificationDate: schedule.lastModificationDate,
  };
}

/**
 * One schedule as a listing reports it.
 *
 * A listing carries less than a describe on real Scheduler: the target's ARN
 * and nothing else about the target, and no expression at all. Reproducing that
 * matters, because code reading `ScheduleExpression` off a listing gets
 * `undefined` from AWS and should get `undefined` here.
 */
export function listedSchedule(
  schedule: SimSchedulerSchedule,
): SimSchedulerListedSchedule {
  return {
    Arn: schedule.arn,
    Name: schedule.name.value,
    GroupName: schedule.groupName,
    State: schedule.state.value,
    Target: { Arn: schedule.target.arn.value },
    CreationDate: schedule.creationDate,
    LastModificationDate: schedule.lastModificationDate,
  };
}
