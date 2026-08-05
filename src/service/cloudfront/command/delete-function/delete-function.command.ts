import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim CloudFront DeleteFunction command.
 */
export interface SimDeleteFunctionCommand {
  readonly input: SimDeleteFunctionCommandInput;
}

/**
 * Minimal structural sim CloudFront DeleteFunction input.
 *
 * `IfMatch` carries the ETag from the preceding DescribeFunction. It is
 * accepted and not checked here, so neither `PreconditionFailed` nor
 * `InvalidIfMatchVersion` can come back. See the handler for why.
 */
export interface SimDeleteFunctionCommandInput {
  readonly Name?: string | undefined;
  readonly IfMatch?: string | undefined;
}

/**
 * Minimal structural sim CloudFront DeleteFunction output.
 *
 * CloudFront answers a deletion with nothing but the response metadata.
 */
export interface SimDeleteFunctionCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
