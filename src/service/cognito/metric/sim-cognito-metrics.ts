import type { SimCloudWatchDimensionInput } from "../../cloudwatch/metric/sim-cloudwatch-dimension.js";

/**
 * The namespace real Cognito publishes what it counts about a pool under.
 */
export const simCognitoMetricNamespace = "AWS/Cognito";

/**
 * The `UserPoolClient` real Cognito reports for a request an administrator
 * made, which reaches the pool without going through an app client at all.
 */
export const simCognitoAdminClientDimension = "Admin";

/**
 * The `UserPoolClient` real Cognito reports for a request naming an app client
 * the pool has none of. The id given is left out of the metric.
 */
export const simCognitoInvalidClientDimension = "Invalid";

/**
 * The dimensions every metric here carries.
 *
 * Real Cognito reports a pool's counts per app client as well as per pool, so
 * one client's traffic can be watched on its own.
 */
export function simCognitoPoolDimensions(
  poolId: string,
  clientId: string,
): readonly SimCloudWatchDimensionInput[] {
  return [
    { Name: "UserPool", Value: poolId },
    { Name: "UserPoolClient", Value: clientId },
  ];
}
