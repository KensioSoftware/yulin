import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { simCfnEventBridgeResourceError } from "../sim-cfn-event-bridge-resource-error.js";
import { eventRuleResourceType } from "../sim-cfn-event-bridge-resource-types.js";

/**
 * What a template can say about a rule that this simulation does not model,
 * and why each one fails the Resource.
 *
 * `RoleArn` is the whole list. A rule reaches its target as the EventBridge
 * service principal, admitted by the target's own resource policy, so a rule
 * deployed with a role would sit in a test looking as though the role decided
 * something.
 */
const refusedPropertyReasons: ReadonlyMap<string, string> = new Map([
  [
    "RoleArn",
    "RoleArn is not simulated, so the Resource is refused rather than " +
      "deployed without it: a rule reaches its target as the EventBridge " +
      "service principal, admitted by the target's own resource policy",
  ],
]);

/**
 * Refuse what this simulation does not model, naming the property.
 *
 * Asked by key rather than by value, so a template writing `null` for one of
 * these is refused rather than read as having left it out.
 */
export function refuseUnsimulatedEventRuleProperties(
  resource: SimCfnResource,
  properties: SimCfnTemplateValueRecord,
): void {
  for (const [property, reason] of refusedPropertyReasons) {
    if (Object.hasOwn(properties, property)) {
      throw simCfnEventBridgeResourceError(
        eventRuleResourceType,
        resource.logicalId,
        reason,
      );
    }
  }
}
