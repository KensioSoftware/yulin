import type { SimS3BucketName } from "./sim-s3-bucket.js";

/**
 * The ARN of a simulated S3 Bucket.
 *
 * S3 Bucket ARNs name no Account and no Region, because Bucket names are
 * globally unique in S3. Object ARNs are this with `/<key>` appended.
 */
export function simS3BucketArn(bucketName: SimS3BucketName | string): string {
  return `arn:aws:s3:::${bucketName}`;
}
