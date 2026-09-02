import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim S3 DeleteBucketEncryption command.
 */
export interface SimDeleteBucketEncryptionCommand {
  readonly input: SimDeleteBucketEncryptionCommandInput;
}

/**
 * Minimal structural sim S3 DeleteBucketEncryption input.
 */
export interface SimDeleteBucketEncryptionCommandInput {
  readonly Bucket?: string | undefined;
}

/**
 * Minimal structural sim S3 DeleteBucketEncryption output.
 */
export interface SimDeleteBucketEncryptionCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
