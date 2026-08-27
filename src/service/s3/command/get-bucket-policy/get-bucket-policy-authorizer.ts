import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simS3BucketArn } from "../../bucket/sim-s3-bucket-arn.js";
import type { SimS3Bucket } from "../../bucket/sim-s3-bucket.js";
import { simS3BucketResourcePolicies } from "../authorize/sim-s3-bucket-resource-policies.js";
import { simS3ConditionContext } from "../authorize/sim-s3-condition-context.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";

interface GetBucketPolicyAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies IAM authorization to an S3 GetBucketPolicy request.
 */
export class GetBucketPolicyAuthorizer {
  private static readonly action = "s3:GetBucketPolicy";

  private readonly iam: SimIamInterServiceAuthZ;

  constructor(properties: GetBucketPolicyAuthorizerProperties) {
    this.iam = properties.iam;
  }

  /**
   * Ensure the caller may read the Bucket policy.
   */
  authorize(bucket: SimS3Bucket, options?: SimS3RequestOptions): void {
    const resource = simS3BucketArn(bucket.bucketName);
    const decision = this.iam.authorize({
      action: GetBucketPolicyAuthorizer.action,
      resource,
      caller: options?.caller,
      conditionContext: simS3ConditionContext(options),
      resourcePolicies: simS3BucketResourcePolicies(bucket),
    });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        reason: decision.denialReason,
        action: GetBucketPolicyAuthorizer.action,
        resource,
      });
    }
  }
}
