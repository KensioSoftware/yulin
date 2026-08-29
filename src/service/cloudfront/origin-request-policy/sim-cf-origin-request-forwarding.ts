/**
 * The cookie behaviours an origin request policy may name.
 *
 * https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-properties-cloudfront-originrequestpolicy-cookiesconfig.html
 */
export const simCfForwardedCookieBehaviors = [
  "none",
  "whitelist",
  "allExcept",
  "all",
] as const;

export type SimCfForwardedCookieBehavior =
  (typeof simCfForwardedCookieBehaviors)[number];

/**
 * The header behaviours an origin request policy may name.
 *
 * These are the two a cache key offers and three more. A policy can forward
 * every header the viewer sent, which is no use as a cache key but is what an
 * Origin behind `AllViewer` receives, and it can add CloudFront's own headers
 * to that or forward everything but a list.
 *
 * https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-properties-cloudfront-originrequestpolicy-headersconfig.html
 */
export const simCfForwardedHeaderBehaviors = [
  "none",
  "whitelist",
  "allViewer",
  "allViewerAndWhitelistCloudFront",
  "allExcept",
] as const;

export type SimCfForwardedHeaderBehavior =
  (typeof simCfForwardedHeaderBehaviors)[number];

/**
 * The query string behaviours an origin request policy may name.
 *
 * https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-properties-cloudfront-originrequestpolicy-querystringsconfig.html
 */
export const simCfForwardedQueryStringBehaviors = [
  "none",
  "whitelist",
  "allExcept",
  "all",
] as const;

export type SimCfForwardedQueryStringBehavior =
  (typeof simCfForwardedQueryStringBehaviors)[number];

interface SimCfOriginRequestForwardingProperties {
  readonly cookieBehavior?: SimCfForwardedCookieBehavior;
  readonly cookies?: readonly string[];
  readonly headerBehavior?: SimCfForwardedHeaderBehavior;
  readonly headers?: readonly string[];
  readonly queryStringBehavior?: SimCfForwardedQueryStringBehavior;
  readonly queryStrings?: readonly string[];
}

/**
 * What an origin request policy carries to the Origin.
 *
 * These are the three `<name>Config` sections of an `OriginRequestPolicyConfig`.
 * Each carries a behaviour and the names it applies to: a `whitelist` forwards
 * the names listed, an `allExcept` forwards everything but them, and `all`,
 * `allViewer` and `none` ignore the list. The header section's
 * `allViewerAndWhitelistCloudFront` forwards every viewer header and the
 * CloudFront headers it lists on top.
 *
 * https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/controlling-origin-requests.html
 */
export class SimCfOriginRequestForwarding {
  public readonly cookieBehavior: SimCfForwardedCookieBehavior;
  public readonly cookies: readonly string[];
  public readonly headerBehavior: SimCfForwardedHeaderBehavior;
  public readonly headers: readonly string[];
  public readonly queryStringBehavior: SimCfForwardedQueryStringBehavior;
  public readonly queryStrings: readonly string[];

  constructor(properties: SimCfOriginRequestForwardingProperties = {}) {
    this.cookieBehavior = properties.cookieBehavior ?? "none";
    this.cookies = properties.cookies ?? [];
    this.headerBehavior = properties.headerBehavior ?? "none";
    this.headers = properties.headers ?? [];
    this.queryStringBehavior = properties.queryStringBehavior ?? "none";
    this.queryStrings = properties.queryStrings ?? [];
  }
}
