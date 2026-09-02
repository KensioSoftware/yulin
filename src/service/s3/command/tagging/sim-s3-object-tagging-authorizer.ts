import type { SimAwsResolvedCaller } from "../../../aws/caller/sim-aws-caller-resolver.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { simS3BucketArn } from "../../bucket/sim-s3-bucket-arn.js";
import type { SimS3Bucket } from "../../bucket/sim-s3-bucket.js";
import { simS3AuthorizeAction } from "../authorize/sim-s3-authorize-action.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";

/**
 * The IAM action one of the three tagging commands is granted by.
 *
 * Real S3 grants them separately, so a policy can let a caller read the tags on
 * an Object it may not retag, and `s3:PutObject` grants none of them.
 */
export type SimS3ObjectTaggingAction =
  | "s3:GetObjectTagging"
  | "s3:PutObjectTagging"
  | "s3:DeleteObjectTagging";

interface SimS3ObjectTaggingAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies IAM authorization to the S3 Object tagging commands.
 *
 * All three are authorized against the Object ARN, because tags belong to the
 * Object rather than to the Bucket holding it.
 */
export class SimS3ObjectTaggingAuthorizer {
  private readonly iam: SimIamInterServiceAuthZ;

  constructor(properties: SimS3ObjectTaggingAuthorizerProperties) {
    this.iam = properties.iam;
  }

  /**
   * Ensure the caller may take this tagging action on an Object, answering the
   * principal it turned out to be.
   */
  authorize(
    action: SimS3ObjectTaggingAction,
    bucket: SimS3Bucket,
    key: string,
    options?: SimS3RequestOptions,
  ): SimAwsResolvedCaller {
    return simS3AuthorizeAction({
      iam: this.iam,
      action,
      resource: `${simS3BucketArn(bucket.bucketName)}/${key}`,
      bucket,
      options,
    });
  }
}
