import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import { samEventRuleResources } from "./sim-cfn-sam-event-rule.js";
import type { SamFunctionEvent } from "./sim-cfn-sam-function-events.js";

/**
 * Expand one `Schedule` event into the rule that fires the function on a
 * timer.
 *
 * The event's `Schedule` is the rule's `ScheduleExpression`, which is the
 * whole of what a `Schedule` event says beyond what every rule event says. A
 * rate or cron expression the rule refuses is refused by the rule, naming
 * itself, rather than being read here.
 *
 * An event stating no `Schedule` expands into a rule with nothing to fire it,
 * which the rule then refuses. A schedule guessed for an event that named none
 * would be a function firing on a timer nobody asked for.
 */
export function samScheduleEventResources(
  event: SamFunctionEvent,
): Record<string, SimCfnTemplateValue> {
  const expression = event.properties["Schedule"];

  return samEventRuleResources({
    event,
    trigger: expression === undefined ? {} : { ScheduleExpression: expression },
  });
}
