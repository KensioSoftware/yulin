import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import type { SimS3BucketName } from "../../bucket/sim-s3-bucket.js";
import { simS3ConditionContext } from "../authorize/sim-s3-condition-context.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";

interface PutBucketPolicyAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies IAM authorization to an S3 PutBucketPolicy request.
 */
export class PutBucketPolicyAuthorizer {
  private static readonly action = "s3:PutBucketPolicy";

  private readonly iam: SimIamInterServiceAuthZ;

  constructor(properties: PutBucketPolicyAuthorizerProperties) {
    this.iam = properties.iam;
  }

  /**
   * Ensure the caller may replace the Bucket policy.
   */
  authorize(bucketName: SimS3BucketName, options?: SimS3RequestOptions): void {
    const resource = `arn:aws:s3:::${bucketName}`;
    const decision = this.iam.authorize({
      action: PutBucketPolicyAuthorizer.action,
      resource,
      caller: options?.caller,
      conditionContext: simS3ConditionContext(options),
    });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        reason: decision.denialReason,
        action: PutBucketPolicyAuthorizer.action,
        resource,
      });
    }
  }
}
