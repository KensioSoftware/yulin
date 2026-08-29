/**
 * What CloudFront tells the viewer about the cache that answered.
 *
 * `X-Cache` says whether the Distribution held the object, and `Age` says how
 * long it has held it. Both go on ahead of the Behavior's response headers
 * policy and the viewer-response event. A policy can take either off, and a
 * viewer-response function sees them.
 *
 * Real CloudFront writes several other values into `X-Cache` (`RefreshHit` and
 * `LambdaGeneratedResponse` among them). A hit and a miss are the two this
 * simulation reaches, and a response answered before the cache was consulted
 * carries no `X-Cache` at all.
 *
 * https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/RequestAndResponseBehaviorCustomOrigin.html
 */
const xCacheHeaderName = "x-cache";

/**
 * The header a hit carries its age in, in seconds.
 */
export const simCfAgeHeaderName = "age";

/**
 * What `X-Cache` reads when the Distribution's cache answered.
 */
export const simCfCacheHit = "Hit from cloudfront";

/**
 * What `X-Cache` reads when the Origin answered.
 */
export const simCfCacheMiss = "Miss from cloudfront";

/**
 * The response with `X-Cache` saying which of the two answered it.
 *
 * An `X-Cache` an Origin sent is replaced, the way CloudFront replaces one.
 */
export function simCfCacheStatusResponse(
  response: Response,
  hit: boolean,
): Response {
  const headers = new Headers(response.headers);

  headers.set(xCacheHeaderName, hit ? simCfCacheHit : simCfCacheMiss);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * How long an entry stored at one instant has been held at another, in whole
 * seconds.
 *
 * Both instants come off the simulation's clock. A test reaches any age it
 * wants by advancing simulated time. A clock wound backwards would give a
 * negative age, and HTTP has no such thing, so zero is the floor.
 */
export function simCfCacheAgeSec(storedAt: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - storedAt.getTime()) / 1000));
}
