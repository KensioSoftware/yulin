import type { SimCloudWatchDimensionInput } from "../../cloudwatch/metric/sim-cloudwatch-dimension.js";

/**
 * The namespace real Lambda publishes what it counts about a function under.
 */
export const simLambdaMetricNamespace = "AWS/Lambda";

/**
 * The dimensions every metric here carries.
 *
 * Real Lambda dimensions a function's own metrics by `FunctionName`, and an
 * alarm a stack declares on one names the function the same way.
 */
export function simLambdaFunctionDimensions(
  functionName: string,
): readonly SimCloudWatchDimensionInput[] {
  return [{ Name: "FunctionName", Value: functionName }];
}
