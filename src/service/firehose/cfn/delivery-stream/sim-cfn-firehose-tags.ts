import { isRecord } from "../../../../util/type-guard/record.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimFirehoseTag } from "../../command/stream/stream.command.js";
import { simCfnFirehoseDeliveryStreamPropertyError } from "../sim-cfn-firehose-resource-error.js";
import { tagsPropertyName } from "./sim-cfn-firehose-delivery-stream-property-names.js";

/**
 * The tags a delivery stream Resource is created with.
 *
 * A simulated delivery stream takes them and does not list them back, the same
 * as one created through the SDK.
 */
export function simCfnFirehoseTags(
  resource: SimCfnResource,
  tags: SimCfnTemplateValue | undefined,
): readonly SimFirehoseTag[] | undefined {
  if (tags === undefined) {
    return undefined;
  }

  if (!Array.isArray(tags)) {
    throw error(resource, `${tagsPropertyName} must be a list`);
  }

  return tags.map((tag) => tagOf(resource, tag));
}

/**
 * One tag, as the key and value a template wrote it as.
 */
function tagOf(
  resource: SimCfnResource,
  tag: SimCfnTemplateValue,
): SimFirehoseTag {
  if (
    !isRecord(tag) ||
    typeof tag["Key"] !== "string" ||
    typeof tag["Value"] !== "string"
  ) {
    throw error(
      resource,
      `${tagsPropertyName} entries must each carry a string Key and Value`,
    );
  }

  return { Key: tag["Key"], Value: tag["Value"] };
}

function error(resource: SimCfnResource, reason: string): Error {
  return simCfnFirehoseDeliveryStreamPropertyError(resource.logicalId, reason);
}
