import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimS3ServerSideEncryptionConfiguration } from "../../bucket/encryption/sim-s3-bucket-encryption.js";

/**
 * Minimal structural sim S3 GetBucketEncryption command.
 */
export interface SimGetBucketEncryptionCommand {
  readonly input: SimGetBucketEncryptionCommandInput;
}

/**
 * Minimal structural sim S3 GetBucketEncryption input.
 */
export interface SimGetBucketEncryptionCommandInput {
  readonly Bucket?: string | undefined;
}

/**
 * Minimal structural sim S3 GetBucketEncryption output.
 *
 * A Bucket nobody has configured answers with the SSE-S3 rule real S3 applies
 * to every Bucket, rather than with an error.
 */
export interface SimGetBucketEncryptionCommandOutput {
  readonly ServerSideEncryptionConfiguration?: SimS3ServerSideEncryptionConfiguration;
  readonly $metadata: SimResponseMetadata;
}
