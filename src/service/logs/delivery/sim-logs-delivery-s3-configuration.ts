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

/** How long a suffix path real CloudWatch Logs accepts. */
const maximumSuffixPathLength = 256;

/** What separates the two halves of a Hive compatible path segment. */
const hiveKeySeparator = "=";

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
    const enableHiveCompatiblePath =
      properties.enableHiveCompatiblePath ?? false;

    if (properties.suffixPath !== undefined) {
      requireSimLogsDeliverySuffixPath(properties.suffixPath);

      if (enableHiveCompatiblePath) {
        requireSimLogsDeliveryHiveSuffixPath(properties.suffixPath);
      }
    }

    this.suffixPath = properties.suffixPath;
    this.enableHiveCompatiblePath = enableHiveCompatiblePath;
  }
}

/**
 * Refuse a suffix path real CloudWatch Logs would refuse.
 *
 * A variable outside the set delivery substitutes is written out as the
 * literal text it is, so a path with a typo in it looks partitioned and is
 * not.
 */
export function requireSimLogsDeliverySuffixPath(suffixPath: string): void {
  if (suffixPath.length === 0) {
    throw new SimLogsValidationException(
      "suffixPath is empty, and CloudWatch Logs takes at least one character",
    );
  }

  if (suffixPath.length > maximumSuffixPathLength) {
    throw new SimLogsValidationException(
      `suffixPath is ${suffixPath.length} characters, and CloudWatch Logs ` +
        `takes at most ${maximumSuffixPathLength}`,
    );
  }

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

/**
 * Refuse a suffix path that spells out the Hive `key=` half itself.
 *
 * Delivery supplies that half under `enableHiveCompatiblePath`, turning
 * `{yyyy}` into `year=2026`. A segment naming the key as well arrives
 * doubled, and real CloudWatch Logs refuses the whole path with "Provided
 * suffixPath is invalid".
 *
 * Only the Hive compatible case is refused. Whether real CloudWatch Logs
 * takes an `=` in a suffix path with the option off is unverified. A path
 * hand-rolling its own partition keys without the option is left alone, and
 * the Limitations in docs/services/logs/README.md say so.
 */
export function requireSimLogsDeliveryHiveSuffixPath(suffixPath: string): void {
  for (const segment of suffixPath.split("/")) {
    if (segment.includes(hiveKeySeparator)) {
      throw new SimLogsValidationException(
        `suffixPath '${suffixPath}' spells out a Hive key in segment ` +
          `'${segment}', and enableHiveCompatiblePath makes delivery write ` +
          "the 'key=' half itself, so '{yyyy}' arrives as 'year=2026'. " +
          `Naming it here doubles the key, and real CloudWatch Logs refuses ` +
          `the path with "Provided suffixPath is invalid"`,
      );
    }
  }
}
