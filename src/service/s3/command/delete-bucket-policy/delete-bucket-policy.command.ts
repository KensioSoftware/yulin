import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim S3 DeleteBucketPolicy command.
 */
export interface SimDeleteBucketPolicyCommand {
  readonly input: SimDeleteBucketPolicyCommandInput;
}

/**
 * Minimal structural sim S3 DeleteBucketPolicy input.
 */
export interface SimDeleteBucketPolicyCommandInput {
  readonly Bucket?: string | undefined;
}

/**
 * Minimal structural sim S3 DeleteBucketPolicy output.
 */
export interface SimDeleteBucketPolicyCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
