import type { SimCloudFrontS3OriginConfig } from "../../command/create-distribution/create-distribution.command.js";

/**
 * Refuse an S3 Origin that reads its Bucket as a legacy origin access identity.
 *
 * An origin access identity signs the Origin request as a CloudFront canonical
 * user, which nothing here models. A Bucket policy granting that canonical user
 * would be evaluated against an anonymous read and deny it, so the Origin would
 * serve nothing and say nothing useful about why. Refusing the declaration by
 * name says it instead.
 *
 * https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html
 */
export function assertNoSimCfS3OriginAccessIdentity(
  originId: string,
  s3OriginConfig: SimCloudFrontS3OriginConfig,
): void {
  const originAccessIdentity = s3OriginConfig.OriginAccessIdentity ?? "";

  if (originAccessIdentity === "") {
    return;
  }

  throw new Error(
    `Sim CloudFront Origin ${originId} sets S3OriginConfig.OriginAccessIdentity to ${originAccessIdentity}, and a legacy origin access identity is not simulated. Use an origin access control, or leave OriginAccessIdentity empty for the anonymous read CloudFront makes without one.`,
  );
}
