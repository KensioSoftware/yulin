/**
 * The DNS label real Lambda uses for Function URL endpoints, sitting between
 * the URL id and the region:
 *
 *   <url-id>.lambda-url.<region>.on.aws
 */
export const lambdaFunctionUrlHostLabel = "lambda-url";

/**
 * The real AWS domain Function URL endpoints live under.
 */
export const lambdaFunctionUrlDomain = "on.aws";

interface SimLambdaFunctionUrlHostProperties {
  readonly urlId: string;
  readonly regionName: string;
}

/**
 * Build the real AWS endpoint hostname for a Function URL.
 */
export function simLambdaFunctionUrlHost(
  properties: SimLambdaFunctionUrlHostProperties,
): string {
  return `${simLambdaFunctionUrlLogicalHost(properties)}.${lambdaFunctionUrlDomain}`;
}

/**
 * Build the logical hostname for a Function URL: the AWS endpoint hostname
 * without the real AWS domain.
 *
 * This is the form Yulin serves on localhost, where the `.on.aws` tail is
 * replaced by the local suffix, in the same way S3 endpoint hostnames drop
 * `.amazonaws.com`.
 */
export function simLambdaFunctionUrlLogicalHost(
  properties: SimLambdaFunctionUrlHostProperties,
): string {
  return `${properties.urlId}.${lambdaFunctionUrlHostLabel}.${properties.regionName}`;
}
