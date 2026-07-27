import { simAwsLocalConfig } from "../../../serve/http/local-server/sim-aws-local.config.js";
import type { AwsRegionName } from "../../aws/sim-aws-region.js";
import type { SimS3BucketName } from "./sim-s3-bucket.js";

/**
 * The simulated S3 REST API endpoint for a Region.
 *
 * This is the URL an AWS SDK client is pointed at, and the client adds the
 * Bucket to it for itself, as it does against real S3. Handing out the service
 * endpoint rather than a Bucket one is therefore what lets the real SDK, and
 * the real presigner, build simulated S3 URLs without being told how.
 */
export function simS3ServiceUrl(regionName: AwsRegionName): URL {
  return new URL(`http://s3.${regionName}.${simAwsLocalConfig.hostname}/`);
}

/**
 * The simulated S3 REST API endpoint for one Bucket, in virtual-hosted style.
 */
export function simS3BucketUrl(
  bucketName: SimS3BucketName,
  regionName: AwsRegionName,
): URL {
  return new URL(
    `http://${bucketName}.s3.${regionName}.${simAwsLocalConfig.hostname}/`,
  );
}
