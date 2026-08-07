import type { SimAws } from "../../../aws/sim-aws.js";
import type { SimCloudFrontS3OriginResolver } from "./sim-cloudfront-s3-origin.js";
import { bucketNameFromCfS3OriginDomainName } from "./sim-cf-s3-origin-bucket-name.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";

/**
 * Create an S3 Origin Resolver backed by a simulated AWS Account/Region scope.
 *
 * The Bucket is resolved in the Account and Region that own it, which is not
 * necessarily where the Distribution was created: serving a Bucket owned by
 * one Account from a Distribution in another is ordinary, and real CloudFront
 * checks neither ownership nor existence when a Distribution is created. What
 * the Distribution may read is left to the Bucket policy.
 *
 * The simulated S3 holding the Bucket is returned with it, because that is what
 * the Bucket policy is evaluated by: an Origin reads through that S3's
 * GetObject command rather than out of Bucket storage.
 */
export function makeSimCfS3OriginResolver(
  simAws: SimAws,
): SimCloudFrontS3OriginResolver {
  return (originDomainName: string) => {
    const bucketName = bucketNameFromCfS3OriginDomainName(originDomainName);
    const bucketScope = simAws.s3().findBucketScope(bucketName);
    assertDefined(
      bucketScope,
      `Unable to find sim S3 Bucket ${bucketName} for sim CloudFront S3 Origin`,
    );

    const simS3 = simAws
      .accountRegionScope(bucketScope.accountId, bucketScope.regionName)
      .s3();
    const bucket = simS3.getSimBucketByName(bucketName);

    if (bucket === undefined) {
      return;
    }

    return { bucket, simS3 };
  };
}
