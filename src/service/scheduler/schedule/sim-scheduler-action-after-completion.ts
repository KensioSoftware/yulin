import { SimSchedulerValidationException } from "../error/sim-scheduler.error.js";
import type { SimSchedulerActionAfterCompletion } from "./sim-scheduler-schedule.js";

const actionsAfterCompletion: ReadonlySet<string> = new Set(["NONE", "DELETE"]);

/**
 * Read what Scheduler does with a schedule once it has finished.
 */
export function actionAfterCompletionIn(
  value: string | undefined,
): SimSchedulerActionAfterCompletion {
  if (value === undefined) {
    return "NONE";
  }

  if (!actionsAfterCompletion.has(value)) {
    throw new SimSchedulerValidationException(
      `Invalid parameter: ActionAfterCompletion Reason: '${value}' is not an ` +
        `action. It is NONE or DELETE.`,
    );
  }

  return value as SimSchedulerActionAfterCompletion;
}
