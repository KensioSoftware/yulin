import type { SimRandom } from "../../../util/random/sim-random.js";
import type { SimSchedulerFlexibleTimeWindow } from "../command/schedule/schedule.command.js";
import { SimSchedulerValidationException } from "../error/sim-scheduler.error.js";

const minimumWindowInMinutes = 1;
const maximumWindowInMinutes = 1440;
const millisecondsPerMinute = 60_000;

/**
 * Refuse a value the API model's own constraints reject, in the words AWS
 * uses for them.
 */
function constraintFailure(
  value: string,
  member: string,
  constraint: string,
): SimSchedulerValidationException {
  return new SimSchedulerValidationException(
    `1 validation error detected: Value '${value}' at ` +
      `'flexibleTimeWindow.${member}' failed to satisfy constraint: ` +
      `Member must ${constraint}`,
  );
}

/**
 * Read the length of a flexible window, refusing one outside 1 to 1440.
 */
function windowLength(minutes: number | undefined): number {
  if (minutes === undefined) {
    throw new SimSchedulerValidationException(
      "Invalid parameter: FlexibleTimeWindow Reason: a FLEXIBLE window " +
        "needs MaximumWindowInMinutes, from 1 to 1440",
    );
  }

  if (!Number.isSafeInteger(minutes)) {
    throw new SimSchedulerValidationException(
      `Invalid parameter: FlexibleTimeWindow Reason: MaximumWindowInMinutes ` +
        `is a whole number of minutes, and ${String(minutes)} is not`,
    );
  }

  if (minutes < minimumWindowInMinutes) {
    throw constraintFailure(
      String(minutes),
      "maximumWindowInMinutes",
      `have value greater than or equal to ${String(minimumWindowInMinutes)}`,
    );
  }

  if (minutes > maximumWindowInMinutes) {
    throw constraintFailure(
      String(minutes),
      "maximumWindowInMinutes",
      `have value less than or equal to ${String(maximumWindowInMinutes)}`,
    );
  }

  return minutes;
}

/**
 * When, relative to its due time, a schedule invokes its target.
 *
 * With `OFF` that is the due time itself. With `FLEXIBLE` it is some moment
 * after the due time and inside the window, which AWS chooses and does not
 * reveal. Firing on the dot instead would let a test pass by relying on
 * timing AWS does not promise, so each occurrence draws its own moment.
 */
export class SimSchedulerTimeWindow {
  /**
   * The window length in minutes, or nothing when the mode is `OFF`.
   */
  public readonly minutes: number | undefined;

  private constructor(minutes: number | undefined) {
    this.minutes = minutes;
  }

  /**
   * Read the window a request carries, which AWS requires on every one.
   */
  static of(
    window: SimSchedulerFlexibleTimeWindow | undefined,
  ): SimSchedulerTimeWindow {
    const mode = window?.Mode;

    if (mode === undefined) {
      throw new SimSchedulerValidationException(
        "FlexibleTimeWindow is required, and its Mode is OFF or FLEXIBLE",
      );
    }

    if (mode === "FLEXIBLE") {
      return new SimSchedulerTimeWindow(
        windowLength(window?.MaximumWindowInMinutes),
      );
    }

    if (mode !== "OFF") {
      throw constraintFailure(
        mode,
        "mode",
        "satisfy enum value set: [OFF, FLEXIBLE]",
      );
    }

    if (window?.MaximumWindowInMinutes !== undefined) {
      throw new SimSchedulerValidationException(
        "Invalid parameter: FlexibleTimeWindow Reason: " +
          "MaximumWindowInMinutes is only allowed when Mode is FLEXIBLE",
      );
    }

    return new SimSchedulerTimeWindow(undefined);
  }

  /**
   * The window as GetSchedule reports it, which is what the request sent.
   */
  get declared(): SimSchedulerFlexibleTimeWindow {
    if (this.minutes === undefined) {
      return { Mode: "OFF" };
    }

    return { Mode: "FLEXIBLE", MaximumWindowInMinutes: this.minutes };
  }

  /**
   * The instant one occurrence invokes its target, drawn from `random`.
   *
   * It is never before the due time and always before the window closes, so
   * a test that moves the clock past the end of the window sees the
   * invocation whatever was drawn.
   */
  invocationAt(due: Date, random: SimRandom): Date {
    if (this.minutes === undefined) {
      return due;
    }

    const offset = Math.floor(
      random.next() * this.minutes * millisecondsPerMinute,
    );

    return new Date(due.getTime() + offset);
  }
}
