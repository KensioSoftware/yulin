import type { SimSchedule } from "../../../../util/schedule/sim-schedule.js";
import { defaultEventBusName } from "../../bus/sim-event-bus-name.js";
import {
  SimEventBridgeUnsimulatedInputException,
  SimEventBridgeValidationException,
} from "../../error/sim-event-bridge.error.js";
import { SimEventPattern } from "../../pattern/sim-event-pattern.js";
import { eventBridgeSchedule } from "../../schedule/sim-event-bridge-schedule.js";
import type { SimPutRuleCommandInput } from "./rule.command.js";

/**
 * What makes a rule fire: an event pattern, a schedule, or both.
 */
export interface SimEventBridgeRuleTrigger {
  readonly pattern: SimEventPattern | undefined;
  readonly schedule: SimSchedule | undefined;
}

/**
 * Read what a PutRule says should make its rule fire.
 *
 * Real EventBridge takes a rule with neither, which matches nothing and fires
 * never. That is refused here rather than created, because a rule that quietly
 * does nothing is indistinguishable from a rule whose pattern went missing on
 * the way in.
 *
 * A `ScheduleExpression` only works on the `default` bus, which is AWS's own
 * restriction and worth reproducing: a scheduled rule put onto a custom bus is
 * created on real AWS by neither the console nor the API, and a simulation that
 * allowed it would let a test pass on a stack that cannot be deployed.
 */
export function eventBridgeRuleTrigger(
  input: SimPutRuleCommandInput,
  busName: string,
): SimEventBridgeRuleTrigger {
  const written = input.ScheduleExpression;

  if (written !== undefined && busName !== defaultEventBusName) {
    throw new SimEventBridgeValidationException(
      `Parameter ScheduleExpression is not valid. Reason: a scheduled rule ` +
        `is only allowed on the ${defaultEventBusName} event bus, and this ` +
        `one is on ${busName}.`,
    );
  }

  // An empty pattern is the same as none at all, since a rule needs something
  // in it to match anything.
  const patternText =
    input.EventPattern === "" ? undefined : input.EventPattern;

  if (patternText === undefined && written === undefined) {
    throw new SimEventBridgeUnsimulatedInputException(
      "A rule needs an EventPattern, a ScheduleExpression, or both. Real " +
        "EventBridge also takes a rule with neither, which matches nothing " +
        "and fires never, and that is refused here rather than created as a " +
        "rule that quietly does nothing.",
    );
  }

  return {
    pattern:
      patternText === undefined ? undefined : SimEventPattern.of(patternText),
    schedule: written === undefined ? undefined : eventBridgeSchedule(written),
  };
}
