import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import { simAwsLocalConfig } from "../../../../serve/http/local-server/sim-aws-local.config.js";
import type { SimS3BucketName } from "../sim-s3-bucket.js";
import type { SimS3BucketWebsite } from "./sim-s3-bucket-website.js";

/**
 * Build the local simulated S3 static website endpoint URL for a Bucket.
 */
export function simS3BucketWebsiteUrl(
  bucketName: SimS3BucketName,
  accountRegionScope: SimAwsAccountRegionScope,
  website: SimS3BucketWebsite,
): URL {
  if (!website.websiteEnabled()) {
    throw new Error(
      `Static website hosting is not enabled for sim S3 Bucket ${bucketName}`,
    );
  }

  return new URL(
    `http://${bucketName}.s3-website.${accountRegionScope.regionName}.${simAwsLocalConfig.hostname}/`,
  );
}
