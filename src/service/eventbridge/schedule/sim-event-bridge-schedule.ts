import { awsCronFieldSpecs } from "../../../util/schedule/cron/sim-cron-field-spec.js";
import { SimSchedule } from "../../../util/schedule/sim-schedule.js";
import type { SimScheduleDialect } from "../../../util/schedule/sim-schedule-dialect.js";
import {
  SimScheduleExpressionError,
  SimUnsimulatedScheduleExpressionError,
} from "../../../util/schedule/sim-schedule.error.js";
import {
  SimEventBridgeUnsimulatedInputException,
  SimEventBridgeValidationException,
} from "../error/sim-event-bridge.error.js";

/**
 * How EventBridge reads a rule's `ScheduleExpression`.
 *
 * Six cron fields, and a rate whose unit has to agree with its value:
 * `rate(1 hours)` is refused by real EventBridge rather than read as one hour.
 * A rule has no one-time form either, so `at(...)` is not one of the shapes it
 * takes. EventBridge Scheduler is a separate service with a different answer to
 * all three, which is why this is a value here rather than the parser's own
 * assumption.
 */
export const eventBridgeScheduleDialect: SimScheduleDialect = {
  cronFields: awsCronFieldSpecs,
  requiresRateAgreement: true,
  allowsOneTime: false,
};

/**
 * Read the `ScheduleExpression` a PutRule carried.
 *
 * The parser is shared and knows nothing about EventBridge, so its refusals are
 * turned into this service's own errors here. Which of the two a caller gets
 * tells them whether they wrote the expression wrongly or reached for a part of
 * cron this simulation does not read.
 */
export function eventBridgeSchedule(source: string): SimSchedule {
  try {
    return SimSchedule.of(source, eventBridgeScheduleDialect);
  } catch (error) {
    if (error instanceof SimUnsimulatedScheduleExpressionError) {
      throw new SimEventBridgeUnsimulatedInputException(
        `ScheduleExpression '${source}' is not simulated: ${error.message}`,
      );
    }

    if (error instanceof SimScheduleExpressionError) {
      throw new SimEventBridgeValidationException(
        `Parameter ScheduleExpression is not valid. Reason: ${error.message}`,
      );
    }

    throw error;
  }
}
