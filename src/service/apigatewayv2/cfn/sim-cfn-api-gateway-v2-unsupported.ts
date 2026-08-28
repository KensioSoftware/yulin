/**
 * The Resource types belonging to a WebSocket API, which is the half of API
 * Gateway v2 this simulation does not model at all.
 */
const webSocketResourceTypeNames = new Set([
  "Model",
  "RouteResponse",
  "IntegrationResponse",
]);

/**
 * Say why a Resource type is unsupported when there is more to say than that
 * nothing creates it yet.
 */
export function simCfnApiGatewayV2UnsupportedReason(
  resourceTypeName: string,
): string {
  if (webSocketResourceTypeNames.has(resourceTypeName)) {
    return ", which belongs to a WebSocket API and is not simulated";
  }

  return "";
}
