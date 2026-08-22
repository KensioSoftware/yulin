import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimCloudFrontDistributionView } from "../../distribution/sim-cf-distribution-view.js";

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
  readonly Distribution?: SimCloudFrontDistributionView | undefined;
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
  readonly DefaultRootObject?: string | undefined;
  readonly CustomErrorResponses?:
    | undefined
    | {
        readonly Quantity?: number | undefined;
        readonly Items?:
          | readonly SimCloudFrontCustomErrorResponseConfig[]
          | undefined;
      };
  readonly Aliases?:
    | undefined
    | {
        readonly Quantity?: number | undefined;
        readonly Items?: readonly string[] | undefined;
      };
  readonly Origins?:
    | undefined
    | {
        readonly Quantity?: number | undefined;
        readonly Items?: readonly SimCloudFrontOriginConfig[] | undefined;
      };
  readonly DefaultCacheBehavior?:
    | SimCloudFrontDefaultCacheBehaviorConfig
    | undefined;
  readonly CacheBehaviors?:
    | undefined
    | {
        readonly Quantity?: number | undefined;
        readonly Items?:
          | readonly SimCloudFrontCacheBehaviorConfig[]
          | undefined;
      };
  readonly ViewerCertificate?: SimCloudFrontViewerCertificate | undefined;
  /**
   * The ARN of the `CLOUDFRONT` scope WAFv2 web ACL in front of the
   * Distribution.
   *
   * CloudFront names its web ACL here rather than through `AssociateWebACL`,
   * which WAFv2 keeps for the regional resource types. The name is the one the
   * CloudFront API uses, and an empty value means no web ACL, as it does in
   * AWS.
   */
  readonly WebACLId?: string | undefined;
}

/**
 * Minimal structural sim CloudFront CustomErrorResponse.
 *
 * The CloudFront API types `ResponseCode` as a string, while
 * `AWS::CloudFront::Distribution` types it as an integer, so both arrive here.
 */
export interface SimCloudFrontCustomErrorResponseConfig {
  readonly ErrorCode?: number | undefined;
  readonly ResponsePagePath?: string | undefined;
  readonly ResponseCode?: string | number | undefined;
  readonly ErrorCachingMinTTL?: number | undefined;
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
 *
 * An Origin is an S3 Origin or a custom Origin, as it is in CloudFront, and
 * which one it is decides how the simulator reaches it. The settings inside
 * `CustomOriginConfig` describe how CloudFront connects to the Origin over the
 * network, which an in-process fetch has no use for, so they are accepted and
 * ignored.
 */
export interface SimCloudFrontOriginConfig {
  readonly Id?: string | undefined;
  readonly DomainName?: string | undefined;
  readonly OriginPath?: string | undefined;
  readonly OriginAccessControlId?: string | undefined;
  readonly S3OriginConfig?: SimCloudFrontS3OriginConfig | undefined;
  readonly CustomOriginConfig?: object | undefined;
  /**
   * The headers CloudFront adds to a request it sends to this Origin.
   *
   * The CloudFront API and CloudFormation name this field differently. The API
   * has `CustomHeaders` and `AWS::CloudFront::Distribution` has
   * `OriginCustomHeaders`, as they differ over `ACMCertificateArn` and
   * `AcmCertificateArn`. Both spellings are accepted so a template and an SDK
   * call reach the simulator the same way.
   */
  readonly CustomHeaders?: SimCloudFrontOriginCustomHeaders | undefined;
  readonly OriginCustomHeaders?: SimCloudFrontOriginCustomHeaders | undefined;
}

/**
 * Minimal structural sim CloudFront Origin custom header list.
 */
export interface SimCloudFrontOriginCustomHeaders {
  readonly Quantity?: number | undefined;
  readonly Items?: readonly SimCloudFrontOriginCustomHeader[] | undefined;
}

/**
 * Minimal structural sim CloudFront Origin custom header.
 */
export interface SimCloudFrontOriginCustomHeader {
  readonly HeaderName?: string | undefined;
  readonly HeaderValue?: string | undefined;
}

/**
 * Minimal structural sim CloudFront S3 Origin config.
 */
export interface SimCloudFrontS3OriginConfig {
  readonly OriginAccessIdentity?: string | undefined;
}

/**
 * Minimal structural sim CloudFront default cache behavior config.
 */
export interface SimCloudFrontDefaultCacheBehaviorConfig {
  readonly TargetOriginId?: string | undefined;
  readonly AllowedMethods?: SimCloudFrontAllowedMethods | undefined;
  readonly ViewerProtocolPolicy?: SimCloudFrontViewerProtocolPolicy | undefined;
  readonly FunctionAssociations?: SimCloudFrontFunctionAssociations | undefined;
  readonly LambdaFunctionAssociations?:
    | SimCloudFrontLambdaFunctionAssociations
    | undefined;
  readonly ResponseHeadersPolicyId?: string | undefined;
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
 * Minimal structural sim CloudFront Lambda@Edge associations list.
 */
export interface SimCloudFrontLambdaFunctionAssociations {
  readonly Quantity?: number | undefined;
  readonly Items?:
    | readonly SimCloudFrontLambdaFunctionAssociation[]
    | undefined;
}

/**
 * Minimal structural sim CloudFront Lambda@Edge association.
 */
export interface SimCloudFrontLambdaFunctionAssociation {
  readonly EventType?:
    | "viewer-request"
    | "viewer-response"
    | "origin-request"
    | "origin-response"
    | undefined;
  readonly LambdaFunctionARN?: string | undefined;
  readonly IncludeBody?: boolean | undefined;
}

/**
 * Minimal structural sim CloudFront allowed methods list.
 */
export interface SimCloudFrontAllowedMethods {
  readonly Quantity?: number | undefined;
  readonly Items?: readonly string[] | undefined;
  readonly CachedMethods?: SimCloudFrontMethodList | undefined;
}

/**
 * Minimal structural sim CloudFront method list.
 */
export interface SimCloudFrontMethodList {
  readonly Quantity?: number | undefined;
  readonly Items?: readonly string[] | undefined;
}

/**
 * Minimal structural sim CloudFront viewer protocol policy.
 */
export type SimCloudFrontViewerProtocolPolicy =
  | "allow-all"
  | "redirect-to-https"
  | "https-only";
