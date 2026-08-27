import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simS3BucketArn } from "../../bucket/sim-s3-bucket-arn.js";
import type { SimS3Bucket } from "../../bucket/sim-s3-bucket.js";
import { simS3BucketResourcePolicies } from "../authorize/sim-s3-bucket-resource-policies.js";
import { simS3ConditionContext } from "../authorize/sim-s3-condition-context.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";

interface SimS3PublicAccessBlockAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies IAM authorization to the S3 Block Public Access commands.
 *
 * Reading the configuration is governed by s3:GetBucketPublicAccessBlock.
 * Both writing and removing it are governed by s3:PutBucketPublicAccessBlock:
 * real S3 has no separate delete permission, so removing the configuration
 * needs exactly what setting it needs.
 */
export class SimS3PublicAccessBlockAuthorizer {
  private static readonly readAction = "s3:GetBucketPublicAccessBlock";
  private static readonly writeAction = "s3:PutBucketPublicAccessBlock";

  private readonly iam: SimIamInterServiceAuthZ;

  constructor(properties: SimS3PublicAccessBlockAuthorizerProperties) {
    this.iam = properties.iam;
  }

  /**
   * Ensure the caller may read the Bucket's Block Public Access settings.
   */
  authorizeRead(bucket: SimS3Bucket, options?: SimS3RequestOptions): void {
    this.authorize(
      SimS3PublicAccessBlockAuthorizer.readAction,
      bucket,
      options,
    );
  }

  /**
   * Ensure the caller may replace or remove the Block Public Access settings.
   */
  authorizeWrite(bucket: SimS3Bucket, options?: SimS3RequestOptions): void {
    this.authorize(
      SimS3PublicAccessBlockAuthorizer.writeAction,
      bucket,
      options,
    );
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
