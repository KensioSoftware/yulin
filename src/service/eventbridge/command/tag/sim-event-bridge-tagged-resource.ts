import type { SimAwsResourceTags } from "../../../aws/tag/sim-aws-resource-tags.js";
import type { SimEventBusStore } from "../../bus/sim-event-bus-store.js";
import type { SimEventRuleStore } from "../../rule/sim-event-rule-store.js";

/**
 * The tags of the rule or event bus an ARN names, or `undefined` where it
 * names neither.
 *
 * Rules and event buses are the only EventBridge resources whose tags are
 * simulated.
 */
export function simEventBridgeTagsOf(
  buses: SimEventBusStore,
  rules: SimEventRuleStore,
  arn: string,
): SimAwsResourceTags | undefined {
  return (
    buses.all.find((bus) => bus.arn.value === arn)?.tags ??
    rules.all.find((rule) => rule.arn === arn)?.tags
  );
}
