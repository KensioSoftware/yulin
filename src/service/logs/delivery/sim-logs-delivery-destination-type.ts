import { SimLogsValidationException } from "../error/sim-logs.error.js";

/**
 * Where a delivery destination puts what it receives.
 *
 * The three values are the abbreviations real CloudWatch Logs reports: an S3
 * bucket, a CloudWatch Logs log group, and a Firehose delivery stream.
 */
export type SimLogsDeliveryDestinationType = "S3" | "CWL" | "FH";

const destinationTypesByArnService = new Map<
  string,
  SimLogsDeliveryDestinationType
>([
  ["s3", "S3"],
  ["logs", "CWL"],
  ["firehose", "FH"],
]);

/**
 * Which kind of destination an ARN names.
 *
 * Real CloudWatch Logs works this out from the ARN rather than taking it from
 * the caller, and reports it back on the destination and on every delivery
 * that uses it. An ARN naming anything else is refused, because a destination
 * of no known kind would accept a delivery and drop everything sent to it.
 */
export function requiredSimLogsDeliveryDestinationType(
  destinationResourceArn: string,
): SimLogsDeliveryDestinationType {
  const service = destinationResourceArn.split(":", 3)[2];
  const destinationType = destinationTypesByArnService.get(service ?? "");

  if (destinationType === undefined) {
    throw new SimLogsValidationException(
      `destinationResourceArn '${destinationResourceArn}' names no ` +
        `delivery destination: it has to be an S3 bucket, a CloudWatch Logs ` +
        `log group or a Firehose delivery stream`,
    );
  }

  return destinationType;
}
