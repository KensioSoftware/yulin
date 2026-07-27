import type { SimS3Bucket, SimS3BucketName } from "../bucket/sim-s3-bucket.js";
import { SimS3NoSuchBucket } from "../error/sim-s3.error.js";

/**
 * Get a Bucket from the scope's Bucket state, or raise S3's missing-Bucket
 * error.
 *
 * Every Bucket-scoped command starts this way, and real S3 answers NoSuchBucket
 * before it considers anything else about the request.
 */
export function requireSimS3Bucket(
  buckets: Map<SimS3BucketName, SimS3Bucket>,
  bucketName: SimS3BucketName,
): SimS3Bucket {
  const bucket = buckets.get(bucketName);

  if (bucket === undefined) {
    throw new SimS3NoSuchBucket(`No S3 Bucket named ${bucketName}`);
  }

  return bucket;
}
