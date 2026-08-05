import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim CloudFront DeleteDistribution command.
 */
export interface SimDeleteDistributionCommand {
  readonly input: SimDeleteDistributionCommandInput;
}

/**
 * Minimal structural sim CloudFront DeleteDistribution input.
 *
 * `IfMatch` carries the ETag from the preceding GetDistribution. It is
 * accepted and not checked here, so neither `PreconditionFailed` nor
 * `InvalidIfMatchVersion` can come back. See the handler for why.
 */
export interface SimDeleteDistributionCommandInput {
  readonly Id?: string | undefined;
  readonly IfMatch?: string | undefined;
}

/**
 * Minimal structural sim CloudFront DeleteDistribution output.
 *
 * CloudFront answers a deletion with nothing but the response metadata.
 */
export interface SimDeleteDistributionCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
