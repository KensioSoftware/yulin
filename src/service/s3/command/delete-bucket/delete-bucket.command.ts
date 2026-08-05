import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim S3 DeleteBucket command.
 */
export interface SimDeleteBucketCommand {
  readonly input: SimDeleteBucketCommandInput;
}

/**
 * Minimal structural sim S3 DeleteBucket input.
 */
export interface SimDeleteBucketCommandInput {
  readonly Bucket?: string | undefined;
}

/**
 * Minimal structural sim S3 DeleteBucket output.
 *
 * Real S3 answers a successful DeleteBucket with 204 No Content, so there is
 * nothing in the body to model.
 */
export interface SimDeleteBucketCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
