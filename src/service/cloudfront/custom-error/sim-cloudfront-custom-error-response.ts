/**
 * The HTTP status codes CloudFront can return a custom error page for.
 */
export const simCloudFrontCustomErrorCodes: ReadonlySet<number> = new Set([
  400, 403, 404, 405, 414, 416, 500, 501, 502, 503, 504,
]);

/**
 * The HTTP status codes CloudFront can return alongside a custom error page.
 *
 * These are the error codes plus 200, which is how a Distribution serves a
 * page for an error without telling the viewer anything went wrong.
 */
export const simCloudFrontCustomErrorResponseCodes: ReadonlySet<number> =
  new Set([200, ...simCloudFrontCustomErrorCodes]);

/**
 * How long CloudFront holds an error for where a rule names no
 * `ErrorCachingMinTTL`, and where a Distribution configures no rule for the
 * status at all.
 *
 * https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/HTTPStatusCodes.html
 */
export const simCloudFrontDefaultErrorCachingMinTtlSec = 10;

/**
 * The page a custom error response serves in place of the Origin's error.
 *
 * CloudFront pairs `ResponsePagePath` and `ResponseCode`. A rule carries both
 * or neither.
 */
export interface SimCloudFrontCustomErrorPage {
  readonly responsePagePath: string;
  readonly responseCode: number;
}

/**
 * A custom error response of a sim CloudFront Distribution.
 *
 * A rule carrying nothing but `ErrorCode` and `ErrorCachingMinTTL` configures
 * how long the Origin's own error is held for. It has no page, and the viewer
 * gets what the Origin answered.
 */
export interface SimCloudFrontCustomErrorResponse {
  readonly errorCode: number;
  readonly errorCachingMinTtlSec: number;
  readonly page?: SimCloudFrontCustomErrorPage | undefined;
}
