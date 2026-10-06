import { isRecord } from "../../../util/type-guard/record.js";
import type { SimCfnTemplateValue } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimSchedulerFlexibleTimeWindow } from "../command/schedule/schedule.command.js";

/**
 * Read a window length, which a template may give as a number or, through a
 * Parameter, as a string of digits. CloudFormation accepts either.
 */
function windowMinutes(
  value: SimCfnTemplateValue | undefined,
  propertyError: (reason: string) => Error,
): number | undefined {
  if (value === undefined || typeof value === "number") {
    return value;
  }

  if (typeof value === "string" && /^\d+$/u.test(value)) {
    return Number(value);
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
