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
 * What a template can say about a rule that this simulation has nothing to act
 * on, and why each one is recorded rather than refused.
 *
 * `Tags` is the whole list. Rule tags never reach `PutRule`, so the record is
 * the only place a tagged rule says it lost them. A rule routes the same
 * events with a tag and without one, and a CDK app calling
 * `Tags.of(app).add(...)` tags every rule in it.
 */
const ignoredPropertyReasons: ReadonlyMap<string, string> = new Map([
  [
    "Tags",
    `${eventRuleResourceType} property Tags is not simulated, so the rule is ` +
      "created without them. Nothing reads them back and nothing is grouped " +
      "or billed by them.",
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

/**
 * Record the properties the rule is created without acting on.
 */
export function recordIgnoredEventRuleProperties(
  resource: SimCfnResource,
  properties: SimCfnTemplateValueRecord,
): void {
  for (const [property, reason] of ignoredPropertyReasons) {
    if (Object.hasOwn(properties, property)) {
      resource.ignoreProperty(property, reason);
    }
  }
}
