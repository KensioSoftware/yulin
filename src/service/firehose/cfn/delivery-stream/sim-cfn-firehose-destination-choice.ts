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
 * The destinations a delivery stream Resource declared.
 *
 * A destination outside the simulation is refused first, in the words
 * CreateDeliveryStream refuses it in, which is what skips the Resource. That is
 * the order the destination model works in too, so a template carrying both an
 * S3 destination and a Redshift one is refused rather than half deployed.
 *
 * Both S3 destinations go through where a template declares both, and
 * CreateDeliveryStream refuses the pair. Which destinations a delivery stream
 * may have is decided in one place, by simulated Firehose, so the template door
 * and the SDK door answer the same request the same way. A template declaring
 * no destination goes through in the same way.
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
  const plain = properties.get(s3DestinationPropertyName);

  return {
    ...(extended !== undefined && {
      ExtendedS3DestinationConfiguration: read(
        resource,
        extendedS3DestinationPropertyName,
        extended,
      ),
    }),
    ...(plain !== undefined && {
      S3DestinationConfiguration: read(
        resource,
        s3DestinationPropertyName,
        plain,
      ),
    }),
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
