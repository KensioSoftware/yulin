/**
 * The HTTP status codes CloudFront can return a custom error page for.
 */
export const simCloudFrontCustomErrorCodes: ReadonlySet<number> = new Set([
  400, 403, 404, 405, 414, 416, 500, 501, 502, 503, 504,
]);

/**
 * A custom error response of a sim CloudFront Distribution.
 *
 * Only a rule with a response page reaches this model. A rule carrying nothing
 * but `ErrorCode` and `ErrorCachingMinTTL` configures error caching, which the
 * simulator has nothing to cache with.
 */
export interface SimCloudFrontCustomErrorResponse {
  readonly errorCode: number;
  readonly responsePagePath: string;
  readonly responseCode: number;
}
