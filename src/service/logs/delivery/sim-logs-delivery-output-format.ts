import { SimLogsValidationException } from "../error/sim-logs.error.js";
import type { SimLogsDeliveryDestinationType } from "./sim-logs-delivery-destination-type.js";

/**
 * How a delivery destination writes what it receives.
 */
export type SimLogsDeliveryOutputFormat =
  | "json"
  | "plain"
  | "w3c"
  | "raw"
  | "parquet";

/**
 * The output formats real CloudWatch Logs accepts, in the lower case the API
 * uses. A template writing `JSON` is refused by an account and is refused
 * here.
 */
export const simLogsDeliveryOutputFormats: readonly SimLogsDeliveryOutputFormat[] =
  ["json", "plain", "w3c", "raw", "parquet"];

/**
 * What a delivery destination writes when the caller names no format.
 */
export const simLogsDefaultDeliveryOutputFormat: SimLogsDeliveryOutputFormat =
  "json";

/**
 * Read the output format a request named, refusing anything else.
 *
 * Parquet is only written to S3. The other two destination kinds have no
 * columnar form to write it into, and a destination that accepted it would
 * deliver something else.
 */
export function requiredSimLogsDeliveryOutputFormat(
  outputFormat: string | undefined,
  destinationType: SimLogsDeliveryDestinationType,
): SimLogsDeliveryOutputFormat {
  if (outputFormat === undefined) {
    return simLogsDefaultDeliveryOutputFormat;
  }

  if (!isSimLogsDeliveryOutputFormat(outputFormat)) {
    throw new SimLogsValidationException(
      `outputFormat '${outputFormat}' is not one CloudWatch Logs delivery ` +
        `accepts: ${simLogsDeliveryOutputFormats.join(", ")}`,
    );
  }

  if (outputFormat === "parquet" && destinationType !== "S3") {
    throw new SimLogsValidationException(
      `outputFormat 'parquet' is only written to an S3 destination, and ` +
        `this one is ${destinationType}`,
    );
  }

  return outputFormat;
}

function isSimLogsDeliveryOutputFormat(
  outputFormat: string,
): outputFormat is SimLogsDeliveryOutputFormat {
  return simLogsDeliveryOutputFormats.includes(
    outputFormat as SimLogsDeliveryOutputFormat,
  );
}
