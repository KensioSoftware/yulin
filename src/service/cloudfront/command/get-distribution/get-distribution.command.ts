import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimCloudFrontDistributionView } from "../../distribution/sim-cf-distribution-view.js";

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
  readonly Distribution?: SimCloudFrontDistributionView | undefined;
  readonly $metadata: SimResponseMetadata;
}
