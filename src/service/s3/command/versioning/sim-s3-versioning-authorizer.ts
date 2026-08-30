import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simS3BucketArn } from "../../bucket/sim-s3-bucket-arn.js";
import type { SimS3Bucket } from "../../bucket/sim-s3-bucket.js";
import { simS3BucketResourcePolicies } from "../authorize/sim-s3-bucket-resource-policies.js";
import { simS3ConditionContext } from "../authorize/sim-s3-condition-context.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";

interface SimS3VersioningAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies IAM authorization to the S3 versioning commands.
 *
 * Three actions rather than two, because listing the versions is a read of the
 * Objects rather than of the Bucket's configuration. s3:ListBucketVersions is
 * the one a caller reading a version history needs, and it says nothing about
 * whether that caller may see how the Bucket is configured.
 */
export class SimS3VersioningAuthorizer {
  private static readonly readAction = "s3:GetBucketVersioning";
  private static readonly writeAction = "s3:PutBucketVersioning";
  private static readonly listAction = "s3:ListBucketVersions";

  private readonly iam: SimIamInterServiceAuthZ;

  constructor(properties: SimS3VersioningAuthorizerProperties) {
    this.iam = properties.iam;
  }

  /**
   * Ensure the caller may read the Bucket's versioning configuration.
   */
  authorizeRead(bucket: SimS3Bucket, options?: SimS3RequestOptions): void {
    this.authorize(SimS3VersioningAuthorizer.readAction, bucket, options);
  }

  /**
   * Ensure the caller may change the Bucket's versioning configuration.
   */
  authorizeWrite(bucket: SimS3Bucket, options?: SimS3RequestOptions): void {
    this.authorize(SimS3VersioningAuthorizer.writeAction, bucket, options);
  }

  /**
   * Ensure the caller may list the versions the Bucket holds.
   */
  authorizeList(bucket: SimS3Bucket, options?: SimS3RequestOptions): void {
    this.authorize(SimS3VersioningAuthorizer.listAction, bucket, options);
  }

  private authorize(
    action: string,
    bucket: SimS3Bucket,
    options?: SimS3RequestOptions,
  ): void {
    const resource = simS3BucketArn(bucket.bucketName);
    const decision = this.iam.authorize({
      action,
      resource,
      caller: options?.caller,
      conditionContext: simS3ConditionContext(options),
      resourcePolicies: simS3BucketResourcePolicies(bucket),
    });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        reason: decision.denialReason,
        action,
        resource,
      });
    }
  }
}
