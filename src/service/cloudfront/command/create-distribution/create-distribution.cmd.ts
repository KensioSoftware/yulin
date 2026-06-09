/**
 * Minimal structural sim CloudFront CreateDistribution command.
 */
export interface SimCreateDistributionCommand {
  readonly input: SimCreateDistributionCommandInput;
}

/**
 * Minimal structural sim CloudFront CreateDistribution input.
 */
export interface SimCreateDistributionCommandInput {
  readonly DistributionConfig?: SimCloudFrontDistributionConfig;
}

/**
 * Minimal structural sim CloudFront CreateDistribution output.
 */
export interface SimCreateDistributionCommandOutput {
  readonly Distribution?: {
    readonly Id?: string;
    readonly ARN?: string;
    readonly Status?: string;
    readonly LastModifiedTime?: Date;
    readonly InProgressInvalidationBatches?: number;
    readonly DomainName?: string;
    readonly DistributionConfig?: SimCloudFrontDistributionConfig;
  };
  readonly Location?: string;
  readonly $metadata: Record<string, unknown>;
}

/**
 * Minimal structural sim CloudFront DistributionConfig.
 */
export interface SimCloudFrontDistributionConfig {
  readonly Aliases?: {
    readonly Items?: readonly string[];
  };
  readonly Origins?: {
    readonly Items?: readonly SimCloudFrontOriginConfig[];
  };
  readonly DefaultCacheBehavior?: SimCloudFrontDefaultCacheBehaviorConfig;
  readonly CacheBehaviors?: {
    readonly Items?: readonly SimCloudFrontCacheBehaviorConfig[];
  };
}

/**
 * Minimal structural sim CloudFront Origin config.
 */
export interface SimCloudFrontOriginConfig {
  readonly Id?: string;
  readonly DomainName?: string;
  readonly OriginPath?: string;
  readonly S3OriginConfig?: object;
}

/**
 * Minimal structural sim CloudFront default cache behavior config.
 */
export interface SimCloudFrontDefaultCacheBehaviorConfig {
  readonly TargetOriginId?: string;
  readonly AllowedMethods?: SimCloudFrontAllowedMethods;
  readonly ViewerProtocolPolicy?: SimCloudFrontViewerProtocolPolicy;
}

/**
 * Minimal structural sim CloudFront cache behavior config.
 */
export interface SimCloudFrontCacheBehaviorConfig extends SimCloudFrontDefaultCacheBehaviorConfig {
  readonly PathPattern?: string;
}

/**
 * Minimal structural sim CloudFront allowed methods list.
 */
export interface SimCloudFrontAllowedMethods {
  readonly Items?: readonly string[];
  readonly CachedMethods?: SimCloudFrontMethodList;
}

/**
 * Minimal structural sim CloudFront method list.
 */
export interface SimCloudFrontMethodList {
  readonly Items?: readonly string[];
}

/**
 * Minimal structural sim CloudFront viewer protocol policy.
 */
export type SimCloudFrontViewerProtocolPolicy =
  | "allow-all"
  | "redirect-to-https"
  | "https-only";
