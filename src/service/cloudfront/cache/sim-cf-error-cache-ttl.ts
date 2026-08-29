import {
  simCloudFrontDefaultErrorCachingMinTtlSec,
  type SimCloudFrontCustomErrorResponse,
} from "../custom-error/sim-cloudfront-custom-error-response.js";

interface SimCfErrorCacheTtlProperties {
  /**
   * The status the Origin answered with, before an origin-response function
   * or a custom error page could replace it.
   */
  readonly originStatus: number;

  /** The response carrying on towards the viewer. */
  readonly response: Response;

  /**
   * The Distribution's custom error responses, whose `ErrorCachingMinTTL`
   * decides.
   */
  readonly customErrorResponses: readonly SimCloudFrontCustomErrorResponse[];
}

/**
 * How many seconds a Distribution holds an error for, or none where this
 * answer is no error at all.
 *
 * An error has a TTL of its own, and the Origin's cache headers and the
 * Behavior's cache policy have no say in it. It comes from the custom error
 * response matching the status, and from CloudFront's ten seconds where the
 * Distribution configures no rule for that status. An `ErrorCachingMinTTL` of
 * zero holds the error for no time at all, which is how a Distribution turns
 * error caching off.
 *
 * The Origin's status is what a rule is matched against. A 404 the
 * Distribution answers with a 200 error page is still held as the error it
 * was, for the seconds the 404's own rule allows. An error that only an
 * origin-response function made has no Origin error behind it, and its own
 * status stands in.
 *
 * https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/HTTPStatusCodes.html
 */
export function simCfErrorCacheTtlSec(
  properties: SimCfErrorCacheTtlProperties,
): number | undefined {
  const { originStatus, response, customErrorResponses } = properties;
  const errorStatus = originStatus >= 400 ? originStatus : response.status;

  if (errorStatus < 400) {
    return undefined;
  }

  return (
    customErrorResponses.find(
      (customErrorResponse) => customErrorResponse.errorCode === errorStatus,
    )?.errorCachingMinTtlSec ?? simCloudFrontDefaultErrorCachingMinTtlSec
  );
}
