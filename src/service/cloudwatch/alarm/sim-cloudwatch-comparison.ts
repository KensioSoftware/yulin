import { SimCloudWatchInvalidParameterValueException } from "../error/sim-cloudwatch.error.js";

/**
 * The threshold comparisons this simulation evaluates.
 *
 * Real CloudWatch has these four and a set of anomaly detection operators
 * besides. The anomaly ones compare against a band a trained model produces
 * rather than against a number, which there is nothing here to train, so they
 * are refused rather than approximated.
 */
export const simCloudWatchComparisonOperators = [
  "GreaterThanOrEqualToThreshold",
  "GreaterThanThreshold",
  "LessThanThreshold",
  "LessThanOrEqualToThreshold",
] as const;

export type SimCloudWatchComparisonOperator =
  (typeof simCloudWatchComparisonOperators)[number];

/**
 * Read a comparison operator, refusing one this simulation cannot evaluate.
 */
export function requiredSimCloudWatchComparisonOperator(
  operator?: string,
): SimCloudWatchComparisonOperator {
  const found = simCloudWatchComparisonOperators.find(
    (one) => one === operator,
  );

  if (found === undefined) {
    throw new SimCloudWatchInvalidParameterValueException(
      `The parameter ComparisonOperator must be one of ` +
        `${simCloudWatchComparisonOperators.join(", ")}. Anomaly detection ` +
        `operators are not simulated, because there is no trained model here ` +
        `for a band to come from.`,
    );
  }

  return found;
}

/**
 * Whether one period's value breaches the threshold.
 */
export function simCloudWatchBreaches(
  value: number,
  threshold: number,
  operator: SimCloudWatchComparisonOperator,
): boolean {
  switch (operator) {
    case "GreaterThanOrEqualToThreshold": {
      return value >= threshold;
    }
    case "GreaterThanThreshold": {
      return value > threshold;
    }
    case "LessThanThreshold": {
      return value < threshold;
    }
    case "LessThanOrEqualToThreshold": {
      return value <= threshold;
    }
  }
}
