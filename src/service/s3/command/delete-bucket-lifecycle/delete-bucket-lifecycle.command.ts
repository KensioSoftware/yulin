import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim S3 DeleteBucketLifecycle command.
 */
export interface SimDeleteBucketLifecycleCommand {
  readonly input: SimDeleteBucketLifecycleCommandInput;
}

/**
 * Minimal structural sim S3 DeleteBucketLifecycle input.
 */
export interface SimDeleteBucketLifecycleCommandInput {
  readonly Bucket?: string | undefined;
}

/**
 * Minimal structural sim S3 DeleteBucketLifecycle output.
 */
export interface SimDeleteBucketLifecycleCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
