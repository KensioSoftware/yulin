import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simS3BucketArn } from "../../bucket/sim-s3-bucket-arn.js";
import type { SimS3Bucket } from "../../bucket/sim-s3-bucket.js";
import { simS3BucketResourcePolicies } from "../authorize/sim-s3-bucket-resource-policies.js";
import { simS3ConditionContext } from "../authorize/sim-s3-condition-context.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";

interface DeleteBucketAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies IAM authorization to an S3 DeleteBucket request.
 *
 * Real S3 governs removing a Bucket with s3:DeleteBucket, which is a distinct
 * action from the s3:CreateBucket that made it. The Bucket policy is consulted
 * as well, because a Bucket policy can grant Bucket administration actions.
 */
export class DeleteBucketAuthorizer {
  private static readonly action = "s3:DeleteBucket";

  private readonly iam: SimIamInterServiceAuthZ;

  constructor(properties: DeleteBucketAuthorizerProperties) {
    this.iam = properties.iam;
  }

  /**
   * Ensure the caller may delete the Bucket.
   */
  authorize(bucket: SimS3Bucket, options?: SimS3RequestOptions): void {
    const resource = simS3BucketArn(bucket.bucketName);
    const decision = this.iam.authorize({
      action: DeleteBucketAuthorizer.action,
      resource,
      caller: options?.caller,
      conditionContext: simS3ConditionContext(options),
      resourcePolicies: simS3BucketResourcePolicies(bucket),
    });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        action: DeleteBucketAuthorizer.action,
        resource,
      });
    }
  }
}
