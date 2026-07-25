import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim S3 PutBucketPolicy command.
 */
export interface SimPutBucketPolicyCommand {
  readonly input: SimPutBucketPolicyCommandInput;
}

/**
 * Minimal structural sim S3 PutBucketPolicy input.
 */
export interface SimPutBucketPolicyCommandInput {
  readonly Bucket?: string | undefined;
  readonly Policy?: string | undefined;
}

/**
 * Minimal structural sim S3 PutBucketPolicy output.
 */
export interface SimPutBucketPolicyCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
