import { awsCronFieldSpecs } from "../../../util/schedule/cron/sim-cron-field-spec.js";
import { SimSchedule } from "../../../util/schedule/sim-schedule.js";
import type { SimScheduleDialect } from "../../../util/schedule/sim-schedule-dialect.js";
import {
  SimScheduleExpressionError,
  SimUnsimulatedScheduleExpressionError,
} from "../../../util/schedule/sim-schedule.error.js";
import {
  SimSchedulerUnsimulatedInputException,
  SimSchedulerValidationException,
} from "../error/sim-scheduler.error.js";

/**
 * The longest `ScheduleExpression` AWS takes.
 */
const maximumExpressionLength = 256;

/**
 * How EventBridge Scheduler reads a `ScheduleExpression`.
 *
 * The same six cron fields an EventBridge rule has, and two differences from
 * one: Scheduler has `at(...)` one-time schedules, and it does not insist a
 * rate's unit agrees with its value, so `rate(1 hours)` is an hour here and a
 * refusal there. Those differences are exactly why the parser takes a dialect
 * rather than having one service's rules built into it.
 */
export const schedulerScheduleDialect: SimScheduleDialect = {
  cronFields: awsCronFieldSpecs,
  requiresRateAgreement: false,
  allowsOneTime: true,
};

/**
 * Read the `ScheduleExpression` a request carried.
 *
 * The shared parser knows nothing about Scheduler, so its refusals become this
 * service's own errors here. Which of the two a caller gets tells them whether
 * the expression is wrong or whether it is right and unsimulated.
 */
export function schedulerSchedule(source: string | undefined): SimSchedule {
  if (source === undefined || source === "") {
    throw new SimSchedulerValidationException("ScheduleExpression is required");
  }

  if (source.length > maximumExpressionLength) {
    throw new SimSchedulerValidationException(
      `ScheduleExpression is at most ${String(maximumExpressionLength)} ` +
        `characters, and this one is ${String(source.length)}`,
    );
  }

  try {
    return SimSchedule.of(source, schedulerScheduleDialect);
  } catch (error) {
    if (error instanceof SimUnsimulatedScheduleExpressionError) {
      throw new SimSchedulerUnsimulatedInputException(
        `ScheduleExpression '${source}' is not simulated: ${error.message}`,
      );
    }

    if (error instanceof SimScheduleExpressionError) {
      throw new SimSchedulerValidationException(
        `Parameter ScheduleExpression is not valid. Reason: ${error.message}`,
      );
    }

    throw error;
  }
}
