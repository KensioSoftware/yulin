import { SimCloudWatchInvalidParameterValueException } from "../error/sim-cloudwatch.error.js";
import {
  refuseSimCloudWatchLeadingColon,
  requiredSimCloudWatchName,
} from "./sim-cloudwatch-name.js";

/**
 * How many dimensions real CloudWatch allows on one metric.
 */
export const simCloudWatchMaximumDimensions = 30;

/**
 * One name/value pair narrowing what a metric measures.
 */
export interface SimCloudWatchDimension {
  readonly name: string;
  readonly value: string;
}

/**
 * A dimension as it arrives on a command, before it has been read.
 */
export interface SimCloudWatchDimensionInput {
  readonly Name?: string | undefined;
  readonly Value?: string | undefined;
}

/**
 * Read the dimensions of one metric, refusing what real CloudWatch would.
 */
export function requiredSimCloudWatchDimensions(
  dimensions?: readonly SimCloudWatchDimensionInput[],
): readonly SimCloudWatchDimension[] {
  if (dimensions === undefined) {
    return [];
  }

  if (dimensions.length > simCloudWatchMaximumDimensions) {
    throw new SimCloudWatchInvalidParameterValueException(
      `A metric may carry at most ${simCloudWatchMaximumDimensions} ` +
        `dimensions, and ${dimensions.length} were given.`,
    );
  }

  return dimensions.map((dimension) => ({
    name: requiredSimCloudWatchDimensionName(dimension.Name),
    value: requiredSimCloudWatchName("Dimension.Value", dimension.Value),
  }));
}

/**
 * Read a dimension name, which real CloudWatch refuses to let start with a
 * colon. A dimension value carries no such rule.
 */
export function requiredSimCloudWatchDimensionName(name?: string): string {
  return refuseSimCloudWatchLeadingColon(
    "Dimension.Name",
    requiredSimCloudWatchName("Dimension.Name", name),
  );
}

/**
 * Write a dimension set as the string that identifies it.
 *
 * Order does not distinguish two dimension sets on real CloudWatch, so the
 * pairs are sorted by name before they are written. JSON does the writing
 * because a dimension value may hold any of the characters a separator could
 * be built from, and two different sets must never write the same key.
 */
export function simCloudWatchDimensionsKey(
  dimensions: readonly SimCloudWatchDimension[],
): string {
  const sorted = dimensions.toSorted((left, right) =>
    left.name.localeCompare(right.name),
  );

  return JSON.stringify(sorted.map((one) => [one.name, one.value]));
}
