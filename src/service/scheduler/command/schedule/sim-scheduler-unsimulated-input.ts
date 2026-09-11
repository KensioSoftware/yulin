import {
  SimSchedulerUnsimulatedInputException,
  SimSchedulerValidationException,
} from "../../error/sim-scheduler.error.js";
import { SimScheduleZone } from "../../../../util/schedule/sim-schedule-zone.js";
import { refuseUnsimulatedTarget } from "./sim-scheduler-unsimulated-target.js";
import type { SimSchedulerScheduleInput } from "./schedule.command.js";

const maximumDescriptionLength = 512;

/**
 * Refuse a timezone no zone answers to, naming the parameter it came in on.
 */
function refuseUnknownTimezone(timezone: string | undefined): void {
  if (timezone === undefined) {
    return;
  }

  try {
    SimScheduleZone.of(timezone);
  } catch {
    throw new SimSchedulerValidationException(
      `Invalid parameter: ScheduleExpressionTimezone Reason: ` +
        `'${timezone}' is not a timezone. A timezone is an IANA name such ` +
        `as 'Europe/London', or 'UTC'`,
    );
  }
}

/**
 * Read the flexible time window, which AWS requires on every request.
 *
 * `FLEXIBLE` is refused rather than treated as `OFF`. The whole point of it is
 * that AWS invokes the target at some unpredictable moment inside the window,
 * and a simulation firing at the exact due time instead would let a test assert
 * on a precision real Scheduler does not offer.
 */
function refuseFlexibleWindow(input: SimSchedulerScheduleInput): void {
  const mode = input.FlexibleTimeWindow?.Mode;

  if (mode === undefined) {
    throw new SimSchedulerValidationException(
      "FlexibleTimeWindow is required, and its Mode is OFF or FLEXIBLE",
    );
  }

  if (mode === "FLEXIBLE") {
    throw new SimSchedulerUnsimulatedInputException(
      "FlexibleTimeWindow Mode FLEXIBLE is not simulated. Real Scheduler " +
        "invokes the target at an unpredictable moment inside the window, " +
        "and firing at the exact due time instead would let a test rely on " +
        "timing AWS does not promise. Use Mode OFF.",
    );
  }

  if (mode !== "OFF") {
    throw new SimSchedulerValidationException(
      `Invalid parameter: FlexibleTimeWindow Mode Reason: '${mode}' is not a ` +
        `mode. A window is OFF or FLEXIBLE.`,
    );
  }
}

/**
 * Refuse the schedule request inputs this simulation does not model.
 *
 * A timezone is one it does model. A name no zone answers to is refused here
 * rather than left to the expression reader, which would report it against
 * `ScheduleExpression` and send the caller to the wrong parameter.
 */
export function refuseUnsimulatedScheduleInput(
  input: SimSchedulerScheduleInput,
): void {
  refuseFlexibleWindow(input);
  refuseUnsimulatedTarget(input.Target);

  refuseUnknownTimezone(input.ScheduleExpressionTimezone);

  if (input.StartDate !== undefined || input.EndDate !== undefined) {
    throw new SimSchedulerUnsimulatedInputException(
      "A schedule StartDate and EndDate are not simulated, so a schedule " +
        "carrying either is refused rather than created as one that fires " +
        "outside the window it was given",
    );
  }

  if (input.KmsKeyArn !== undefined) {
    throw new SimSchedulerUnsimulatedInputException(
      "A schedule KmsKeyArn is not simulated, so a schedule carrying one is " +
        "refused rather than created with its input unencrypted",
    );
  }

  if (
    input.Description !== undefined &&
    input.Description.length > maximumDescriptionLength
  ) {
    throw new SimSchedulerValidationException(
      `Invalid parameter: Description Reason: a description is at most ${String(maximumDescriptionLength)} characters, and this one is ${String(input.Description.length)}`,
    );
  }
}
