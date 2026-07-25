import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim S3 ListBuckets command.
 */
export interface SimListBucketsCommand {
  readonly input: SimListBucketsCommandInput;
}

/**
 * Minimal structural sim S3 ListBuckets input.
 */
export interface SimListBucketsCommandInput {
  readonly Prefix?: string | undefined;
  readonly ContinuationToken?: string | undefined;
  readonly MaxBuckets?: number | undefined;
}

/**
 * Minimal structural sim S3 ListBuckets output.
 */
export interface SimListBucketsCommandOutput {
  readonly Buckets?: SimS3BucketSummary[] | undefined;
  readonly ContinuationToken?: string | undefined;
  readonly Prefix?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim S3 bucket summary.
 */
export interface SimS3BucketSummary {
  readonly Name?: string | undefined;
}
