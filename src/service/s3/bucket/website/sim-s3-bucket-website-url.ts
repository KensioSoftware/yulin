import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import { simAwsLocalConf } from "../../../../serve/http/sim-aws-local.conf.js";
import type { SimS3BucketName } from "../sim-s3-bucket.js";
import type { S3BucketWebsite } from "./s3-bucket-website.js";

/**
 * Build the local simulated S3 static website endpoint URL for a Bucket.
 */
export function simS3BucketWebsiteUrl(
  bucketName: SimS3BucketName,
  accountRegionScope: SimAwsAccountRegionScope,
  website: S3BucketWebsite,
): URL {
  if (!website.websiteEnabled()) {
    throw new Error(
      `Static website hosting is not enabled for sim S3 Bucket ${bucketName}`,
    );
  }

  return new URL(
    `http://${bucketName}.s3-website.${accountRegionScope.regionName}.${simAwsLocalConf.hostname}/`,
  );
}
