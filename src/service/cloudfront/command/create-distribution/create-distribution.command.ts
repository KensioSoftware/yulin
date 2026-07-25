import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

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
  readonly DistributionConfig?: SimCloudFrontDistributionConfig | undefined;
}

/**
 * Minimal structural sim CloudFront CreateDistribution output.
 */
export interface SimCreateDistributionCommandOutput {
  readonly Distribution?:
    | undefined
    | {
        readonly Id?: string | undefined;
        readonly ARN?: string | undefined;
        readonly Status?: string | undefined;
        readonly LastModifiedTime?: Date | undefined;
        readonly InProgressInvalidationBatches?: number | undefined;
        readonly DomainName?: string | undefined;
        readonly DistributionConfig?:
          SimCloudFrontDistributionConfig | undefined;
      };
  readonly Location?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim CloudFront DistributionConfig.
 */
export interface SimCloudFrontDistributionConfig {
  readonly CallerReference?: string | undefined;
  readonly Comment?: string | undefined;
  readonly Enabled?: boolean | undefined;
  readonly Aliases?:
    | undefined
    | {
        readonly Items?: readonly string[] | undefined;
      };
  readonly Origins?:
    | undefined
    | {
        readonly Items?: readonly SimCloudFrontOriginConfig[] | undefined;
      };
  readonly DefaultCacheBehavior?:
    SimCloudFrontDefaultCacheBehaviorConfig | undefined;
  readonly CacheBehaviors?:
    | undefined
    | {
        readonly Items?:
          readonly SimCloudFrontCacheBehaviorConfig[] | undefined;
      };
  readonly ViewerCertificate?: SimCloudFrontViewerCertificate | undefined;
}

/**
 * Minimal structural sim CloudFront ViewerCertificate.
 *
 * The CloudFront API and CloudFormation capitalise the certificate fields
 * differently: the API has `ACMCertificateArn` and `SSLSupportMethod`, while
 * `AWS::CloudFront::Distribution` has `AcmCertificateArn` and
 * `SslSupportMethod`. Both spellings are accepted so a template and an SDK
 * call reach the simulator the same way.
 */
export interface SimCloudFrontViewerCertificate {
  readonly CloudFrontDefaultCertificate?: boolean | undefined;
  readonly ACMCertificateArn?: string | undefined;
  readonly AcmCertificateArn?: string | undefined;
  readonly SSLSupportMethod?: string | undefined;
  readonly SslSupportMethod?: string | undefined;
  readonly MinimumProtocolVersion?: string | undefined;
}

/**
 * Minimal structural sim CloudFront Origin config.
 */
export interface SimCloudFrontOriginConfig {
  readonly Id?: string | undefined;
  readonly DomainName?: string | undefined;
  readonly OriginPath?: string | undefined;
  readonly S3OriginConfig?: object | undefined;
}

/**
 * Minimal structural sim CloudFront default cache behavior config.
 */
export interface SimCloudFrontDefaultCacheBehaviorConfig {
  readonly TargetOriginId?: string | undefined;
  readonly AllowedMethods?: SimCloudFrontAllowedMethods | undefined;
  readonly ViewerProtocolPolicy?: SimCloudFrontViewerProtocolPolicy | undefined;
  readonly FunctionAssociations?: SimCloudFrontFunctionAssociations | undefined;
}

/**
 * Minimal structural sim CloudFront cache behavior config.
 */
export interface SimCloudFrontCacheBehaviorConfig extends SimCloudFrontDefaultCacheBehaviorConfig {
  readonly PathPattern?: string | undefined;
  readonly FunctionAssociations?: SimCloudFrontFunctionAssociations | undefined;
}

/**
 * Minimal structural sim CloudFront function associations list.
 */
export interface SimCloudFrontFunctionAssociations {
  readonly Quantity?: number | undefined;
  readonly Items?: readonly SimCloudFrontFunctionAssociation[] | undefined;
}

/**
 * Minimal structural sim CloudFront function association.
 */
export interface SimCloudFrontFunctionAssociation {
  readonly EventType?:
    | "viewer-request"
    | "viewer-response"
    | "origin-request"
    | "origin-response"
    | undefined;
  readonly FunctionARN?: string | undefined;
}

/**
 * Minimal structural sim CloudFront allowed methods list.
 */
export interface SimCloudFrontAllowedMethods {
  readonly Items?: readonly string[] | undefined;
  readonly CachedMethods?: SimCloudFrontMethodList | undefined;
}

/**
 * Minimal structural sim CloudFront method list.
 */
export interface SimCloudFrontMethodList {
  readonly Items?: readonly string[] | undefined;
}

/**
 * Minimal structural sim CloudFront viewer protocol policy.
 */
export type SimCloudFrontViewerProtocolPolicy =
  "allow-all" | "redirect-to-https" | "https-only";
