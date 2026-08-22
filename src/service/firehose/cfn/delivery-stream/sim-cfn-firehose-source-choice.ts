import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { simCfnFirehoseUnsupportedResourceError } from "../sim-cfn-firehose-resource-error.js";
import {
  kinesisStreamSourcePropertyName,
  readSourcePropertyNames,
  sourcePropertySuffix,
} from "./sim-cfn-firehose-delivery-stream-property-names.js";

/**
 * The source configuration a delivery stream Resource reads from.
 *
 * A source outside the simulation skips the Resource, naming the property the
 * template wrote. A delivery stream reading from MSK or from a database would
 * take nothing and deliver nothing, and `DeliveryStreamType` is no help in
 * finding it: the property is what says where the records come from, and a
 * template that leaves the type out gets `DirectPut` by default, on real
 * CloudFormation as well as here.
 *
 * `KinesisStreamSourceConfiguration` goes through to CreateDeliveryStream, so
 * where a delivery stream reads from is decided in one place.
 */
export function simCfnFirehoseSource(
  resource: SimCfnResource,
  properties: ReadonlyMap<string, SimCfnTemplateValue>,
): SimCfnTemplateValue | undefined {
  const unsimulated = properties
    .keys()
    .find(
      (name) =>
        name.endsWith(sourcePropertySuffix) &&
        !readSourcePropertyNames.has(name),
    );

  if (unsimulated !== undefined) {
    throw simCfnFirehoseUnsupportedResourceError(
      resource.logicalId,
      `simulated Firehose takes records through PutRecord and PutRecordBatch, ` +
        `and this delivery stream declares ${unsimulated}`,
    );
  }

  return properties.get(kinesisStreamSourcePropertyName);
}
