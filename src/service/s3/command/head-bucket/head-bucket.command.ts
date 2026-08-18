import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim S3 HeadBucket command.
 */
export interface SimHeadBucketCommand {
  readonly input: SimHeadBucketCommandInput;
}

/**
 * Minimal structural sim S3 HeadBucket input.
 */
export interface SimHeadBucketCommandInput {
  readonly Bucket?: string | undefined;
}

/**
 * Minimal structural sim S3 HeadBucket output.
 *
 * The operation answers whether the Bucket is there and reachable, so a
 * successful answer carries nothing beyond the Region it was found in.
 */
export interface SimHeadBucketCommandOutput {
  readonly BucketRegion?: string;
  readonly $metadata: SimResponseMetadata;
}
