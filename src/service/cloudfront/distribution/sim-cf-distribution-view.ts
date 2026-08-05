import type { SimCloudFrontDistributionConfig } from "../command/create-distribution/create-distribution.command.js";
import type { SimCloudFrontDistribution } from "./sim-cloudfront-distribution.js";

/**
 * Minimal structural sim CloudFront Distribution, as the API returns it.
 *
 * CreateDistribution, GetDistribution and UpdateDistribution all answer with
 * this same shape, so they all build it here.
 */
export interface SimCloudFrontDistributionView {
  readonly Id?: string | undefined;
  readonly ARN?: string | undefined;
  readonly Status?: string | undefined;
  readonly LastModifiedTime?: Date | undefined;
  readonly InProgressInvalidationBatches?: number | undefined;
  readonly DomainName?: string | undefined;
  readonly DistributionConfig?: SimCloudFrontDistributionConfig | undefined;
}

/**
 * Build the API view of a sim CloudFront Distribution.
 */
export function simCloudFrontDistributionView(
  distribution: SimCloudFrontDistribution,
): SimCloudFrontDistributionView {
  return {
    Id: distribution.distributionId,
    ARN: simCloudFrontDistributionArn(distribution),
    Status: distribution.status,
    LastModifiedTime: distribution.lastModifiedTime,
    InProgressInvalidationBatches: 0,
    DomainName: `${distribution.distributionId.toLowerCase()}.cloudfront.net`,
    DistributionConfig: distribution.distributionConfig,
  };
}

/**
 * Build the ARN of a sim CloudFront Distribution. CloudFront is not
 * region-scoped, so the Region segment of the ARN is always empty.
 */
export function simCloudFrontDistributionArn(
  distribution: SimCloudFrontDistribution,
): string {
  return `arn:aws:cloudfront::${distribution.accountId}:distribution/${distribution.distributionId}`;
}
