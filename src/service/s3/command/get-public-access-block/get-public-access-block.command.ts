import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimS3PublicAccessBlockSettings } from "../../bucket/public-access/sim-s3-public-access-block.js";

/**
 * Minimal structural sim S3 GetPublicAccessBlock command.
 */
export interface SimGetPublicAccessBlockCommand {
  readonly input: SimGetPublicAccessBlockCommandInput;
}

/**
 * Minimal structural sim S3 GetPublicAccessBlock input.
 */
export interface SimGetPublicAccessBlockCommandInput {
  readonly Bucket?: string | undefined;
}

/**
 * Minimal structural sim S3 GetPublicAccessBlock output.
 */
export interface SimGetPublicAccessBlockCommandOutput {
  readonly PublicAccessBlockConfiguration: SimS3PublicAccessBlockSettings;
  readonly $metadata: SimResponseMetadata;
}
