import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { simCfnTagRecord } from "../../../cloudformation/template/value/sim-cfn-tag-record.js";
import type { SimKmsTag } from "../../key/sim-kms-key-tags.js";

/**
 * A key's `Tags` property, in the shape `CreateKey` takes it. A CDK app
 * calling `Tags.of(app).add(...)` tags every key in it.
 */
export function simCfnKmsTags(
  tags: SimCfnTemplateValue | undefined,
): SimKmsTag[] | undefined {
  const record = simCfnTagRecord(tags);

  return record === undefined
    ? undefined
    : Object.entries(record).map(([TagKey, TagValue]) => ({
        TagKey,
        TagValue,
      }));
}
