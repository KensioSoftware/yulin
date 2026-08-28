import { SimSchedulerValidationException } from "../error/sim-scheduler.error.js";

const maximumNameLength = 64;

/**
 * The characters AWS takes in a schedule name, and in a group name: letters,
 * digits, hyphen, underscore and full stop.
 */
const allowedName = /^[0-9a-zA-Z\-_.]+$/u;

/**
 * The schedule group a request naming none goes to.
 *
 * Every Account has a `default` group without one being created, which is why
 * this is a name every scope already has rather than one the first request
 * makes up.
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
 * A request naming no group gets `default`, as AWS does. Whether the group is
 * there is a separate question, asked once the caller has been authorized, so
 * nothing here reaches a store.
 */
export function requestedScheduleGroupName(value: string | undefined): string {
  if (value === undefined) {
    return defaultScheduleGroupName;
  }

  return readName("GroupName", value);
}

/**
 * The name of the schedule group a group command names, which is required.
 */
export function requiredScheduleGroupName(value: string | undefined): string {
  return readName("Name", value);
}
