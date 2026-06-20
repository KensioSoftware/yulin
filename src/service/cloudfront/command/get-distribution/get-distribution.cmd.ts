import type { SimCloudFrontDistributionConfig } from "../create-distribution/create-distribution.cmd.js";
import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim CloudFront GetDistribution command.
 */
export interface SimGetDistributionCommand {
  readonly input: SimGetDistributionCommandInput;
}

/**
 * Minimal structural sim CloudFront GetDistribution input.
 */
export interface SimGetDistributionCommandInput {
  readonly Id?: string | undefined;
}

/**
 * Minimal structural sim CloudFront GetDistribution output.
 */
export interface SimGetDistributionCommandOutput {
  readonly Distribution?:
    | {
        readonly Id?: string | undefined;
        readonly ARN?: string | undefined;
        readonly Status?: string | undefined;
        readonly LastModifiedTime?: Date | undefined;
        readonly InProgressInvalidationBatches?: number | undefined;
        readonly DomainName?: string | undefined;
        readonly DistributionConfig?:
          | SimCloudFrontDistributionConfig
          | undefined;
      }
    | undefined;
  readonly $metadata: SimResponseMetadata;
}
