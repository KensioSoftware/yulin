import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimFirehoseDestinationInput } from "../../destination/sim-firehose-destination-choice.js";
import { SimFirehoseUnsimulatedDestination } from "../../error/sim-firehose.error.js";
import { SimCfnFirehoseS3Destination } from "./sim-cfn-firehose-s3-destination.js";
import {
  destinationPropertySuffix,
  extendedS3DestinationPropertyName,
  s3DestinationPropertyName,
  simulatedDestinationPropertyNames,
} from "./sim-cfn-firehose-delivery-stream-property-names.js";

/**
 * The destination a delivery stream Resource writes to.
 *
 * A destination outside the simulation is refused first, in the words
 * CreateDeliveryStream refuses it in, which is what skips the Resource. That is
 * the order the destination model works in too, so a template carrying both an
 * S3 destination and a Redshift one is refused rather than half deployed.
 *
 * The extended destination wins over the plain one, as it does on real
 * Firehose. A template declaring neither is left alone here, and
 * CreateDeliveryStream refuses it, as real CloudFormation refuses it.
 */
export function simCfnFirehoseDestination(
  resource: SimCfnResource,
  properties: ReadonlyMap<string, SimCfnTemplateValue>,
): SimFirehoseDestinationInput {
  const unsimulated = properties
    .keys()
    .find(
      (name) =>
        name.endsWith(destinationPropertySuffix) &&
        !simulatedDestinationPropertyNames.has(name),
    );

  if (unsimulated !== undefined) {
    throw new SimFirehoseUnsimulatedDestination(unsimulated);
  }

  const extended = properties.get(extendedS3DestinationPropertyName);

  if (extended !== undefined) {
    return {
      ExtendedS3DestinationConfiguration: read(
        resource,
        extendedS3DestinationPropertyName,
        extended,
      ),
    };
  }

  const plain = properties.get(s3DestinationPropertyName);

  if (plain === undefined) {
    return {};
  }

  return {
    S3DestinationConfiguration: read(
      resource,
      s3DestinationPropertyName,
      plain,
    ),
  };
}

function read(
  resource: SimCfnResource,
  propertyName: string,
  value: SimCfnTemplateValue,
): ReturnType<SimCfnFirehoseS3Destination["input"]> {
  return new SimCfnFirehoseS3Destination({
    resource,
    propertyName,
    value,
  }).input();
}
