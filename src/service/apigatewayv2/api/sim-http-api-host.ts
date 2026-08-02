/**
 * The DNS label API Gateway uses for the endpoint it generates for an API,
 * sitting between the API id and the region:
 *
 *   <api-id>.execute-api.<region>.amazonaws.com
 *
 * It is also the SigV4 signing name of that endpoint, which is not the signing
 * name of the API Gateway control plane.
 */
export const executeApiHostLabel = "execute-api";

/**
 * The real AWS domain generated API endpoints live under.
 */
export const executeApiDomain = "amazonaws.com";

interface SimHttpApiHostProperties {
  readonly apiId: string;
  readonly regionName: string;
}

/**
 * Build the real AWS endpoint hostname for an API.
 */
export function simHttpApiHost(properties: SimHttpApiHostProperties): string {
  return `${simHttpApiLogicalHost(properties)}.${executeApiDomain}`;
}

/**
 * Build the logical hostname for an API: the AWS endpoint hostname without the
 * real AWS domain.
 *
 * This is the form Yulin serves on localhost, where the `.amazonaws.com` tail
 * is replaced by the local suffix, in the same way S3 endpoint hostnames are.
 */
export function simHttpApiLogicalHost(
  properties: SimHttpApiHostProperties,
): string {
  return `${properties.apiId}.${executeApiHostLabel}.${properties.regionName}`;
}
