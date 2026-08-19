import {
  executeApiDomain,
  executeApiHostLabel,
} from "../../apigatewayv2/api/sim-http-api-host.js";

interface SimRestApiHostProperties {
  readonly apiId: string;
  readonly regionName: string;
}

/**
 * Build the real AWS endpoint hostname for a REST API.
 *
 * REST APIs and HTTP APIs are issued endpoints under the same `execute-api`
 * host, which is why the two labels come from one place. What differs is the
 * path. Every REST API request carries its stage as the first path segment,
 * where an HTTP API can serve a `$default` stage at the root.
 */
export function simRestApiHost(properties: SimRestApiHostProperties): string {
  return `${simRestApiLogicalHost(properties)}.${executeApiDomain}`;
}

/**
 * Build the logical hostname for a REST API: the AWS endpoint hostname without
 * the real AWS domain.
 *
 * This is the form Yulin serves on localhost, where the `.amazonaws.com` tail
 * is replaced by the local suffix.
 */
export function simRestApiLogicalHost(
  properties: SimRestApiHostProperties,
): string {
  return `${properties.apiId}.${executeApiHostLabel}.${properties.regionName}`;
}
