import { SimCloudWatchInvalidParameterValueException } from "../error/sim-cloudwatch.error.js";

/**
 * What an alarm makes of a period nothing was published into.
 *
 * `missing` is the default and means the period counts towards neither side:
 * an alarm whose every period is missing has nothing to say and reports
 * INSUFFICIENT_DATA. `ignore` is the one that is not about the period at all;
 * it says the alarm keeps whatever state it already had.
 */
export const simCloudWatchMissingDataTreatments = [
  "missing",
  "notBreaching",
  "breaching",
  "ignore",
] as const;

export type SimCloudWatchMissingDataTreatment =
  (typeof simCloudWatchMissingDataTreatments)[number];

export const simCloudWatchDefaultMissingData: SimCloudWatchMissingDataTreatment =
  "missing";

/**
 * Read how missing data should be treated, refusing an unknown treatment.
 */
export function simCloudWatchMissingDataOrDefault(
  treatMissingData?: string,
): SimCloudWatchMissingDataTreatment {
  if (treatMissingData === undefined) {
    return simCloudWatchDefaultMissingData;
  }

  const found = simCloudWatchMissingDataTreatments.find(
    (one) => one === treatMissingData,
  );

  if (found === undefined) {
    throw new SimCloudWatchInvalidParameterValueException(
      `The parameter TreatMissingData must be one of ` +
        `${simCloudWatchMissingDataTreatments.join(", ")}.`,
    );
  }

  return found;
}
