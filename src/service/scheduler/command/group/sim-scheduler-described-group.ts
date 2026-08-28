import type { SimSchedulerScheduleGroup } from "../../group/sim-scheduler-schedule-group.js";
import type {
  SimGetScheduleGroupCommandOutput,
  SimSchedulerListedScheduleGroup,
} from "./group.command.js";

/**
 * One group as `GetScheduleGroup` reports it.
 */
export function describedScheduleGroup(
  group: SimSchedulerScheduleGroup,
): Omit<SimGetScheduleGroupCommandOutput, "$metadata"> {
  return {
    Arn: group.arn,
    Name: group.name,
    State: group.state,
    CreationDate: group.creationDate,
    LastModificationDate: group.lastModificationDate,
  };
}

/**
 * One group as a listing reports it.
 *
 * A group has nothing a describe carries and a listing does not, unlike a
 * schedule, so these two agree on everything. They are written apart anyway
 * because the AWS shapes are separate and only one of them has required
 * fields.
 */
export function listedScheduleGroup(
  group: SimSchedulerScheduleGroup,
): SimSchedulerListedScheduleGroup {
  return {
    Arn: group.arn,
    Name: group.name,
    State: group.state,
    CreationDate: group.creationDate,
    LastModificationDate: group.lastModificationDate,
  };
}
