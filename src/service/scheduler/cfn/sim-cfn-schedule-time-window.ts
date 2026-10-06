import { isRecord } from "../../../util/type-guard/record.js";
import type { SimCfnTemplateValue } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimSchedulerFlexibleTimeWindow } from "../command/schedule/schedule.command.js";

/**
 * Read a window length, which a template may give as a number or, through a
 * Number Parameter, as a numeric string such as "15" or "15.0". Whether the
 * number is a valid length is left to simulated Scheduler.
 */
function windowMinutes(
  value: SimCfnTemplateValue | undefined,
  propertyError: (reason: string) => Error,
): number | undefined {
  if (value === undefined || typeof value === "number") {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const minutes = Number(value);

    if (Number.isFinite(minutes)) {
      return minutes;
    }
  }

  throw propertyError("FlexibleTimeWindow MaximumWindowInMinutes is a number");
}

/**
 * Read an `AWS::Scheduler::Schedule` time window into the shape
 * CreateSchedule takes.
 *
 * Whether the window is valid is left to simulated Scheduler, so a template
 * and an SDK request are refused for the same reasons.
 */
export function cfnFlexibleTimeWindow(
  window: SimCfnTemplateValue | undefined,
  propertyError: (reason: string) => Error,
): SimSchedulerFlexibleTimeWindow | undefined {
  if (window === undefined) {
    return undefined;
  }

  if (!isRecord(window)) {
    throw propertyError("FlexibleTimeWindow is an object");
  }

  return {
    Mode: typeof window["Mode"] === "string" ? window["Mode"] : undefined,
    MaximumWindowInMinutes: windowMinutes(
      window["MaximumWindowInMinutes"],
      propertyError,
    ),
  };
}
