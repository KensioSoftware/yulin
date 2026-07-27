import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim S3 DeletePublicAccessBlock command.
 */
export interface SimDeletePublicAccessBlockCommand {
  readonly input: SimDeletePublicAccessBlockCommandInput;
}

/**
 * Minimal structural sim S3 DeletePublicAccessBlock input.
 */
export interface SimDeletePublicAccessBlockCommandInput {
  readonly Bucket?: string | undefined;
}

/**
 * Minimal structural sim S3 DeletePublicAccessBlock output.
 */
export interface SimDeletePublicAccessBlockCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
