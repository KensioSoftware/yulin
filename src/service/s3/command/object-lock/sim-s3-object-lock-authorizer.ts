import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { simS3BucketArn } from "../../bucket/sim-s3-bucket-arn.js";
import type { SimS3Bucket } from "../../bucket/sim-s3-bucket.js";
import { simS3AuthorizeAction } from "../authorize/sim-s3-authorize-action.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";

/** The IAM action a caller needs to get past a governance retention period. */
export const simS3BypassGovernanceAction = "s3:BypassGovernanceRetention";

const readConfiguration = "s3:GetBucketObjectLockConfiguration";
const writeConfiguration = "s3:PutBucketObjectLockConfiguration";
const putRetention = "s3:PutObjectRetention";
const putLegalHold = "s3:PutObjectLegalHold";

interface SimS3ObjectLockAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies IAM authorization to the S3 Object Lock commands.
 *
 * The two Bucket configuration actions are authorized against the Bucket ARN
 * and the two version actions against the Object ARN, which is how real S3
 * splits them: a policy can let a caller retain the Objects under one prefix
 * without letting it configure the Bucket they are in.
 *
 * `s3:BypassGovernanceRetention` is authorized separately from the request it
 * accompanies. A caller deleting a retained version needs both that and
 * `s3:DeleteObject`, and real S3 checks them as two decisions.
 */
export class SimS3ObjectLockAuthorizer {
  private readonly iam: SimIamInterServiceAuthZ;

  constructor(properties: SimS3ObjectLockAuthorizerProperties) {
    this.iam = properties.iam;
  }

  /** Ensure the caller may read how the Bucket is locked. */
  authorizeReadConfiguration(
    bucket: SimS3Bucket,
    options?: SimS3RequestOptions,
  ): void {
    this.authorize(readConfiguration, bucketArn(bucket), bucket, options);
  }

  /** Ensure the caller may change how the Bucket is locked. */
  authorizeWriteConfiguration(
    bucket: SimS3Bucket,
    options?: SimS3RequestOptions,
  ): void {
    this.authorize(writeConfiguration, bucketArn(bucket), bucket, options);
  }

  /** Ensure the caller may put a retention period on a version. */
  authorizeRetention(
    bucket: SimS3Bucket,
    key: string,
    options?: SimS3RequestOptions,
  ): void {
    this.authorize(putRetention, objectArn(bucket, key), bucket, options);
  }

  /** Ensure the caller may put a legal hold on a version. */
  authorizeLegalHold(
    bucket: SimS3Bucket,
    key: string,
    options?: SimS3RequestOptions,
  ): void {
    this.authorize(putLegalHold, objectArn(bucket, key), bucket, options);
  }

  /**
   * Ensure the caller may get past a governance retention period, where the
   * request asked to.
   *
   * A request that asked for nothing is answered without a decision, so a
   * caller who never needed the permission is never refused for lacking it.
   */
  authorizeBypass(
    bucket: SimS3Bucket,
    key: string,
    asked: boolean | undefined,
    options?: SimS3RequestOptions,
  ): boolean {
    if (asked !== true) {
      return false;
    }

    const action = simS3BypassGovernanceAction;
    this.authorize(action, objectArn(bucket, key), bucket, options);

    return true;
  }

  private authorize(
    action: string,
    resource: string,
    bucket: SimS3Bucket,
    options?: SimS3RequestOptions,
  ): void {
    simS3AuthorizeAction({ iam: this.iam, action, resource, bucket, options });
  }
}

function bucketArn(bucket: SimS3Bucket): string {
  return simS3BucketArn(bucket.bucketName);
}

function objectArn(bucket: SimS3Bucket, key: string): string {
  return `${bucketArn(bucket)}/${key}`;
}
