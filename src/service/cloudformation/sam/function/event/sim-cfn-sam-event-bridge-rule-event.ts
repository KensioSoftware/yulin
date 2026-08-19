import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import { samEventRuleResources } from "./sim-cfn-sam-event-rule.js";
import type { SamFunctionEvent } from "./sim-cfn-sam-function-events.js";

/**
 * Expand one `EventBridgeRule` event into the rule that invokes the function
 * for a matching event.
 *
 * The event's `Pattern` is the rule's `EventPattern`, and an event naming an
 * `EventBusName` watches that bus rather than the default one. A pattern the
 * rule cannot parse is refused by the rule rather than being read here.
 *
 * An event stating no `Pattern` expands into a rule matching nothing, which
 * the rule then refuses. A pattern guessed for an event that named none would
 * be a function invoked for events it never asked for.
 */
export function samEventBridgeRuleEventResources(
  event: SamFunctionEvent,
): Record<string, SimCfnTemplateValue> {
  const pattern = event.properties["Pattern"];

  return samEventRuleResources({
    event,
    trigger: pattern === undefined ? {} : { EventPattern: pattern },
  });
}
