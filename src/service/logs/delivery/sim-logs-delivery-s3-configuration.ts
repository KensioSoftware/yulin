import { SimLogsValidationException } from "../error/sim-logs.error.js";

/**
 * The partition variables an S3 suffix path may carry.
 *
 * These are the ones CloudFront standard logging v2 substitutes. A variable
 * outside the set is written out as the literal text it is, so a template with
 * `{DistributionID}` in it would produce a folder of that name and look like
 * it had partitioned nothing.
 */
export const simLogsDeliverySuffixPathVariables: readonly string[] = [
  "DistributionId",
  "distributionid",
  "yyyy",
  "MM",
  "dd",
  "HH",
  "accountid",
];

const suffixPathVariablePattern = /{([^{}]*)}/g;

interface SimLogsDeliveryS3ConfigurationProperties {
  readonly suffixPath: string | undefined;
  readonly enableHiveCompatiblePath: boolean | undefined;
}

/**
 * How a delivery lays out what it writes into an S3 bucket.
 *
 * The suffix path decides the key each log file lands under, and the Hive
 * compatible flag decides whether that key is written in the `name=value` form
 * Athena and Glue partition on.
 */
export class SimLogsDeliveryS3Configuration {
  readonly suffixPath: string | undefined;
  readonly enableHiveCompatiblePath: boolean;

  constructor(properties: SimLogsDeliveryS3ConfigurationProperties) {
    if (properties.suffixPath !== undefined) {
      requireSimLogsDeliverySuffixPath(properties.suffixPath);
    }

    this.suffixPath = properties.suffixPath;
    this.enableHiveCompatiblePath =
      properties.enableHiveCompatiblePath ?? false;
  }
}

/**
 * Refuse a suffix path naming a partition variable that would never be
 * substituted.
 */
export function requireSimLogsDeliverySuffixPath(suffixPath: string): void {
  for (const match of suffixPath.matchAll(suffixPathVariablePattern)) {
    const variable = match[1] ?? "";

    if (!simLogsDeliverySuffixPathVariables.includes(variable)) {
      throw new SimLogsValidationException(
        `suffixPath '${suffixPath}' names partition variable '{${variable}}', ` +
          `which delivery does not substitute. The ones it does are ${simLogsDeliverySuffixPathVariables
            .map((name) => `{${name}}`)
            .join(", ")}`,
      );
    }
  }
}
