import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimS3ServerSideEncryptionConfiguration } from "../../bucket/encryption/sim-s3-bucket-encryption.js";

/**
 * Minimal structural sim S3 PutBucketEncryption command.
 */
export interface SimPutBucketEncryptionCommand {
  readonly input: SimPutBucketEncryptionCommandInput;
}

/**
 * Minimal structural sim S3 PutBucketEncryption input.
 */
export interface SimPutBucketEncryptionCommandInput {
  readonly Bucket?: string | undefined;
  readonly ServerSideEncryptionConfiguration?:
    | SimS3ServerSideEncryptionConfiguration
    | undefined;
}

/**
 * Minimal structural sim S3 PutBucketEncryption output.
 */
export interface SimPutBucketEncryptionCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
