import {
  SimFirehoseInvalidArgumentException,
  SimFirehoseUnsimulatedDestination,
} from "../error/sim-firehose.error.js";
import {
  SimFirehoseS3Destination,
  type SimFirehoseS3DestinationInput,
} from "./sim-firehose-s3-destination.js";

/**
 * The suffix every Firehose destination configuration field ends in.
 */
const destinationSuffix = "DestinationConfiguration";

/**
 * The two destination fields this simulation delivers to.
 */
const simulatedDestinations = new Set([
  "ExtendedS3DestinationConfiguration",
  "S3DestinationConfiguration",
]);

/**
 * The destination configurations a CreateDeliveryStream request can carry.
 *
 * Only the two S3 ones are read. The rest are here so a request naming one
 * type checks, and they are found at run time by the suffix every destination
 * field shares. A destination AWS adds later is refused by name without this
 * file having heard of it.
 */
export interface SimFirehoseDestinationInput {
  readonly ExtendedS3DestinationConfiguration?:
    | SimFirehoseS3DestinationInput
    | undefined;
  readonly S3DestinationConfiguration?:
    | SimFirehoseS3DestinationInput
    | undefined;
  readonly RedshiftDestinationConfiguration?: unknown;
  readonly ElasticsearchDestinationConfiguration?: unknown;
  readonly AmazonopensearchserviceDestinationConfiguration?: unknown;
  readonly AmazonOpenSearchServerlessDestinationConfiguration?: unknown;
  readonly SplunkDestinationConfiguration?: unknown;
  readonly HttpEndpointDestinationConfiguration?: unknown;
  readonly IcebergDestinationConfiguration?: unknown;
  readonly SnowflakeDestinationConfiguration?: unknown;
}

/**
 * The S3 destination a request declared, or a refusal saying why there is none.
 *
 * The extended configuration wins where a request carries both, as it does on
 * real Firehose. A CDK `DeliveryStream` with an `S3Bucket` destination
 * synthesizes the extended form.
 *
 * A destination outside the simulation is refused rather than ignored. A
 * delivery stream created against one would take records and drop them, and a
 * test asserting on an empty Bucket would blame the code under test.
 */
export function simFirehoseDestinationOf(
  input: SimFirehoseDestinationInput,
): SimFirehoseS3Destination {
  const unsimulated = Object.entries(input).find(
    ([field, value]) =>
      value !== undefined &&
      field.endsWith(destinationSuffix) &&
      !simulatedDestinations.has(field),
  );

  if (unsimulated !== undefined) {
    throw new SimFirehoseUnsimulatedDestination(unsimulated[0]);
  }

  const s3 =
    input.ExtendedS3DestinationConfiguration ??
    input.S3DestinationConfiguration;

  if (s3 === undefined) {
    throw new SimFirehoseInvalidArgumentException(
      "The delivery stream declares no destination. Declare an " +
        "ExtendedS3DestinationConfiguration naming a simulated Bucket.",
    );
  }

  return new SimFirehoseS3Destination(s3);
}
