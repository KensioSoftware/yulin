/**
 * Minimal structural sim S3 PutBucketWebsite command.
 */
export interface SimPutBucketWebsiteCommand {
  readonly input: SimPutBucketWebsiteCommandInput;
}

/**
 * Minimal structural sim S3 PutBucketWebsite input.
 */
export interface SimPutBucketWebsiteCommandInput {
  readonly Bucket?: string | undefined;
  readonly WebsiteConfiguration?: SimS3WebsiteConfiguration | undefined;
}

/**
 * Minimal structural sim S3 PutBucketWebsite output.
 */
export interface SimPutBucketWebsiteCommandOutput {
  readonly $metadata: Record<string, unknown>;
}

/**
 * Minimal structural sim S3 website configuration.
 */
export interface SimS3WebsiteConfiguration {
  readonly IndexDocument?: SimS3WebsiteIndexDocument | undefined;
  readonly ErrorDocument?: SimS3WebsiteErrorDocument | undefined;
  readonly RedirectAllRequestsTo?:
    | SimS3WebsiteRedirectAllRequestsTo
    | undefined;
  readonly RoutingRules?: readonly SimS3WebsiteRoutingRule[] | undefined;
}

/**
 * Minimal structural sim S3 website index document.
 */
export interface SimS3WebsiteIndexDocument {
  readonly Suffix?: string | undefined;
}

/**
 * Minimal structural sim S3 website error document.
 */
export interface SimS3WebsiteErrorDocument {
  readonly Key?: string | undefined;
}

/**
 * Minimal structural sim S3 website redirect-all-requests target.
 */
export interface SimS3WebsiteRedirectAllRequestsTo {
  readonly HostName?: string | undefined;
  readonly Protocol?: string | undefined;
}

/**
 * Minimal structural sim S3 website routing rule.
 */
export interface SimS3WebsiteRoutingRule {
  readonly Condition?: SimS3WebsiteRoutingRuleCondition | undefined;
  readonly Redirect?: SimS3WebsiteRedirect | undefined;
}

/**
 * Minimal structural sim S3 website routing rule condition.
 */
export interface SimS3WebsiteRoutingRuleCondition {
  readonly HttpErrorCodeReturnedEquals?: string | undefined;
  readonly KeyPrefixEquals?: string | undefined;
}

/**
 * Minimal structural sim S3 website redirect.
 */
export interface SimS3WebsiteRedirect {
  readonly HostName?: string | undefined;
  readonly HttpRedirectCode?: string | undefined;
  readonly Protocol?: string | undefined;
  readonly ReplaceKeyPrefixWith?: string | undefined;
  readonly ReplaceKeyWith?: string | undefined;
}
