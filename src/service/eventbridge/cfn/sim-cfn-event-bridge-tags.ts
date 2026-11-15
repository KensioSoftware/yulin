import type { SimCfnTemplateValue } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import { simCfnTagRecord } from "../../cloudformation/template/value/sim-cfn-tag-record.js";
import type { SimEventBridgeTag } from "../command/bus/bus.command.js";

/**
 * A rule's or event bus's `Tags` property, in the shape `PutRule` and
 * `CreateEventBus` take it. A CDK app calling `Tags.of(app).add(...)` tags
 * every rule and bus in it.
 */
export function simCfnEventBridgeTags(
  tags: SimCfnTemplateValue | undefined,
): SimEventBridgeTag[] | undefined {
  const record = simCfnTagRecord(tags);

  return record === undefined
    ? undefined
    : Object.entries(record).map(([Key, Value]) => ({ Key, Value }));
}
