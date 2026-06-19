import type { SimAws } from "../../../aws/sim-aws.js";
import type { SimAwsAccountRegionContainer } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimCloudFrontS3OriginResolver } from "./sim-cloudfront-s3-origin.js";
import { bucketNameFromCfS3OriginDomainName } from "./sim-cf-s3-origin-bucket-name.js";

/**
 * Create an S3 Origin Resolver backed by a simulated AWS Account/Region scope.
 */
export function makeSimCfS3OriginResolver(
  simAws: SimAws,
  scope: SimAwsAccountRegionContainer,
): SimCloudFrontS3OriginResolver {
  return (originDomainName: string) => {
    const bucketName = bucketNameFromCfS3OriginDomainName(originDomainName);
    const bucketScope = simAws.s3().findBucketScope(bucketName);
    if (bucketScope === undefined) {
      throw new Error(
        `Unable to find sim S3 Bucket ${bucketName} for sim CloudFront S3 Origin`,
      );
    }

    return simAws
      .region(bucketScope.regionName)
      .account(scope.account.accountId)
      .s3()
      .getSimBucketByName(bucketName);
  };
}
