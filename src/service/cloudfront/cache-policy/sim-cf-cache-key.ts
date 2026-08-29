/**
 * The cookie behaviours a cache policy may name.
 *
 * https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-properties-cloudfront-cachepolicy-cookiesconfig.html
 */
export const simCfCacheKeyCookieBehaviors = [
  "none",
  "whitelist",
  "allExcept",
  "all",
] as const;

export type SimCfCacheKeyCookieBehavior =
  (typeof simCfCacheKeyCookieBehaviors)[number];

/**
 * The header behaviours a cache policy may name.
 *
 * These are two of the four an origin request policy offers. A cache key can
 * name headers or leave them all out; there is no `allViewer` to key a cache
 * on, since keying on every header a viewer sent would cache almost nothing
 * twice.
 *
 * https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-properties-cloudfront-cachepolicy-headersconfig.html
 */
export const simCfCacheKeyHeaderBehaviors = ["none", "whitelist"] as const;

export type SimCfCacheKeyHeaderBehavior =
  (typeof simCfCacheKeyHeaderBehaviors)[number];

/**
 * The query string behaviours a cache policy may name.
 *
 * https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-properties-cloudfront-cachepolicy-querystringsconfig.html
 */
export const simCfCacheKeyQueryStringBehaviors = [
  "none",
  "whitelist",
  "allExcept",
  "all",
] as const;

export type SimCfCacheKeyQueryStringBehavior =
  (typeof simCfCacheKeyQueryStringBehaviors)[number];

interface SimCloudFrontCacheKeyProperties {
  readonly cookieBehavior?: SimCfCacheKeyCookieBehavior;
  readonly cookies?: readonly string[];
  readonly headerBehavior?: SimCfCacheKeyHeaderBehavior;
  readonly headers?: readonly string[];
  readonly queryStringBehavior?: SimCfCacheKeyQueryStringBehavior;
  readonly queryStrings?: readonly string[];
  readonly enableAcceptEncodingGzip?: boolean;
  readonly enableAcceptEncodingBrotli?: boolean;
}

/**
 * What a cache policy keys its cache on.
 *
 * This is CloudFront's `ParametersInCacheKeyAndForwardedToOrigin`. Each of the
 * three sections carries a behaviour and the names it applies to: a
 * `whitelist` keys on the names listed, an `allExcept` keys on everything but
 * them, and `all` and `none` ignore the list. The names listed are also the
 * ones CloudFront forwards to the Origin.
 *
 * The two `EnableAcceptEncoding` flags decide whether the normalized
 * `Accept-Encoding` header joins the key, which is what lets one object be
 * cached once compressed and once not.
 *
 * https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/controlling-the-cache-key.html
 */
export class SimCloudFrontCacheKey {
  public readonly cookieBehavior: SimCfCacheKeyCookieBehavior;
  public readonly cookies: readonly string[];
  public readonly headerBehavior: SimCfCacheKeyHeaderBehavior;
  public readonly headers: readonly string[];
  public readonly queryStringBehavior: SimCfCacheKeyQueryStringBehavior;
  public readonly queryStrings: readonly string[];
  public readonly enableAcceptEncodingGzip: boolean;
  public readonly enableAcceptEncodingBrotli: boolean;

  constructor(properties: SimCloudFrontCacheKeyProperties = {}) {
    this.cookieBehavior = properties.cookieBehavior ?? "none";
    this.cookies = properties.cookies ?? [];
    this.headerBehavior = properties.headerBehavior ?? "none";
    this.headers = properties.headers ?? [];
    this.queryStringBehavior = properties.queryStringBehavior ?? "none";
    this.queryStrings = properties.queryStrings ?? [];
    this.enableAcceptEncodingGzip =
      properties.enableAcceptEncodingGzip ?? false;
    this.enableAcceptEncodingBrotli =
      properties.enableAcceptEncodingBrotli ?? false;
  }
}
