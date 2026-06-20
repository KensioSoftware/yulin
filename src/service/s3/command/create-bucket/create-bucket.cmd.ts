import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim S3 CreateBucket command.
 */
export interface SimCreateBucketCommand {
  readonly input: SimCreateBucketCommandInput;
}

/**
 * Minimal structural sim S3 CreateBucket input.
 */
export interface SimCreateBucketCommandInput {
  readonly Bucket?: string | undefined;
}

/**
 * Minimal structural sim S3 CreateBucket output.
 */
export interface SimCreateBucketCommandOutput {
  readonly BucketArn?: string;
  readonly Location?: string;
  readonly $metadata: SimResponseMetadata;
}
