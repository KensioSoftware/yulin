import { SimLogsValidationException } from "../error/sim-logs.error.js";

/**
 * Where a delivery destination puts what it receives.
 *
 * The three values are the abbreviations real CloudWatch Logs reports: an S3
 * bucket, a CloudWatch Logs log group, and a Firehose delivery stream.
 */
export type SimLogsDeliveryDestinationType = "S3" | "CWL" | "FH";

/** How many colon separated segments the shortest ARN has. */
const arnSegmentCount = 6;

interface SimLogsDeliveryDestinationArnShape {
  /** The service segment of the ARN. */
  readonly service: string;

  /** What the resource part starts with, empty where it carries no type. */
  readonly resourcePrefix: string;

  readonly destinationType: SimLogsDeliveryDestinationType;
}

/**
 * The ARN shapes a delivery destination can be built over.
 *
 * The service alone is too little to go on. An account holds plenty of `logs`
 * resources that are not log groups, the delivery destinations themselves
 * among them, and one named as a destination's target would take a delivery
 * and drop everything sent to it.
 */
const destinationArnShapes: readonly SimLogsDeliveryDestinationArnShape[] = [
  { service: "s3", resourcePrefix: "", destinationType: "S3" },
  { service: "logs", resourcePrefix: "log-group:", destinationType: "CWL" },
  {
    service: "firehose",
    resourcePrefix: "deliverystream/",
    destinationType: "FH",
  },
];

/**
 * Which kind of destination an ARN names.
 *
 * Real CloudWatch Logs works this out from the ARN rather than taking it from
 * the caller, and reports it back on the destination and on every delivery
 * that uses it.
 */
export function requiredSimLogsDeliveryDestinationType(
  destinationResourceArn: string,
): SimLogsDeliveryDestinationType {
  const segments = destinationResourceArn.split(":");

  if (segments[0] !== "arn" || segments.length < arnSegmentCount) {
    throw destinationArnError(destinationResourceArn);
  }

  const service = segments[2] ?? "";
  const resource = segments.slice(arnSegmentCount - 1).join(":");
  const shape = destinationArnShapes.find(
    (candidate) =>
      candidate.service === service &&
      resource.startsWith(candidate.resourcePrefix) &&
      resource.length > candidate.resourcePrefix.length,
  );

  if (shape === undefined) {
    throw destinationArnError(destinationResourceArn);
  }

  return shape.destinationType;
}

function destinationArnError(destinationResourceArn: string): Error {
  return new SimLogsValidationException(
    `destinationResourceArn '${destinationResourceArn}' names no delivery ` +
      `destination: it has to be an S3 bucket, a CloudWatch Logs log group ` +
      `or a Firehose delivery stream`,
  );
}
