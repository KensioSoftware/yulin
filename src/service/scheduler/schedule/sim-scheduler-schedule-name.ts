import {
  SimSchedulerUnsimulatedInputException,
  SimSchedulerValidationException,
} from "../error/sim-scheduler.error.js";

const maximumNameLength = 64;

/**
 * The characters AWS takes in a schedule name, and in a group name: letters,
 * digits, hyphen, underscore and full stop.
 */
const allowedName = /^[0-9a-zA-Z\-_.]+$/u;

/**
 * The one schedule group this simulation has.
 *
 * Every Account has a `default` group without one being created, and named
 * groups are a resource of their own with their own commands. Nothing here
 * creates one, so a schedule asking for another group is refused rather than
 * quietly put in `default`, where it would have the wrong ARN and be found by
 * a listing that should not see it.
 */
export const defaultScheduleGroupName = "default";

/**
 * Read and validate a schedule name, or a group name, which AWS constrains
 * identically.
 */
function readName(kind: string, value: string | undefined): string {
  if (value === undefined || value === "") {
    throw new SimSchedulerValidationException(`${kind} is required`);
  }

  if (value.length > maximumNameLength) {
    throw new SimSchedulerValidationException(
      `${kind} is at most ${String(maximumNameLength)} characters, and this ` +
        `one is ${String(value.length)}`,
    );
  }

  if (!allowedName.test(value)) {
    throw new SimSchedulerValidationException(
      `${kind} '${value}' is not valid. A name is letters, digits, and the ` +
        `characters - _ and .`,
    );
  }

  return value;
}

/**
 * The name of one simulated schedule.
 */
export class SimSchedulerScheduleName {
  public readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  /**
   * Read the schedule name a request names.
   */
  static required(value: string | undefined): SimSchedulerScheduleName {
    return new this(readName("Name", value));
  }
}

/**
 * The name of the schedule group a request names.
 *
 * A request naming no group gets `default`, as AWS does. One naming any other
 * group is refused: schedule groups are not simulated, and a schedule quietly
 * moved into `default` would carry an ARN naming a group it is not in.
 */
export function requestedScheduleGroupName(value: string | undefined): string {
  if (value === undefined) {
    return defaultScheduleGroupName;
  }

  const groupName = readName("GroupName", value);

  if (groupName !== defaultScheduleGroupName) {
    throw new SimSchedulerUnsimulatedInputException(
      `Schedule groups are not simulated, so a schedule goes in the ` +
        `${defaultScheduleGroupName} group. GroupName '${groupName}' is ` +
        `refused rather than put in ${defaultScheduleGroupName}, where its ` +
        `ARN would name a group it is not in.`,
    );
  }

  return groupName;
}
