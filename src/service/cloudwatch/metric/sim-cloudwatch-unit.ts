import { SimCloudWatchInvalidParameterValueException } from "../error/sim-cloudwatch.error.js";

/**
 * The units real CloudWatch accepts, which are a closed set rather than free
 * text: `StandardUnit` in the API model.
 *
 * A value outside it is refused rather than stored, because a metric published
 * in a unit CloudWatch does not have would be refused in an account, and one
 * read back by such a unit would match nothing here while failing there.
 */
export const simCloudWatchUnits = [
  "Seconds",
  "Microseconds",
  "Milliseconds",
  "Bytes",
  "Kilobytes",
  "Megabytes",
  "Gigabytes",
  "Terabytes",
  "Bits",
  "Kilobits",
  "Megabits",
  "Gigabits",
  "Terabits",
  "Percent",
  "Count",
  "Bytes/Second",
  "Kilobytes/Second",
  "Megabytes/Second",
  "Gigabytes/Second",
  "Terabytes/Second",
  "Bits/Second",
  "Kilobits/Second",
  "Megabits/Second",
  "Gigabits/Second",
  "Terabits/Second",
  "Count/Second",
  "None",
] as const;

export type SimCloudWatchUnit = (typeof simCloudWatchUnits)[number];

/**
 * Read a unit, refusing one real CloudWatch does not have.
 *
 * An absent unit stays absent: a metric may be published without one, and a
 * query naming none reads whatever units the metric holds.
 */
export function simCloudWatchUnitOrUndefined(
  field: string,
  unit?: string,
): SimCloudWatchUnit | undefined {
  if (unit === undefined) {
    return undefined;
  }

  const found = simCloudWatchUnits.find((one) => one === unit);

  if (found === undefined) {
    throw new SimCloudWatchInvalidParameterValueException(
      `The parameter ${field} must be one of the units CloudWatch has, and ` +
        `${unit} is not one of them.`,
    );
  }

  return found;
}
