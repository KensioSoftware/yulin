import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimCloudFrontDistributionView } from "../../distribution/sim-cf-distribution-view.js";
import type { SimCloudFrontDistributionConfig } from "../create-distribution/create-distribution.command.js";

/**
 * Minimal structural sim CloudFront UpdateDistribution command.
 */
export interface SimUpdateDistributionCommand {
  readonly input: SimUpdateDistributionCommandInput;
}

/**
 * Minimal structural sim CloudFront UpdateDistribution input.
 *
 * CloudFront takes the whole DistributionConfig rather than a patch, so the
 * usual sequence is GetDistribution, change a field, then UpdateDistribution.
 *
 * `IfMatch` carries the ETag from that read. It is accepted and not checked
 * here, so neither `PreconditionFailed` nor `InvalidIfMatchVersion` can come
 * back. See the handler for why.
 */
export interface SimUpdateDistributionCommandInput {
  readonly Id?: string | undefined;
  readonly IfMatch?: string | undefined;
  readonly DistributionConfig?: SimCloudFrontDistributionConfig | undefined;
}

/**
 * Minimal structural sim CloudFront UpdateDistribution output.
 */
export interface SimUpdateDistributionCommandOutput {
  readonly Distribution?: SimCloudFrontDistributionView | undefined;
  readonly $metadata: SimResponseMetadata;
}
