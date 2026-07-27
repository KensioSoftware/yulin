import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimS3PublicAccessBlockConfiguration } from "../../bucket/public-access/sim-s3-public-access-block.js";

/**
 * Minimal structural sim S3 PutPublicAccessBlock command.
 */
export interface SimPutPublicAccessBlockCommand {
  readonly input: SimPutPublicAccessBlockCommandInput;
}

/**
 * Minimal structural sim S3 PutPublicAccessBlock input.
 */
export interface SimPutPublicAccessBlockCommandInput {
  readonly Bucket?: string | undefined;
  readonly PublicAccessBlockConfiguration?:
    SimS3PublicAccessBlockConfiguration | undefined;
}

/**
 * Minimal structural sim S3 PutPublicAccessBlock output.
 */
export interface SimPutPublicAccessBlockCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
