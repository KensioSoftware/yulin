import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import type { SimS3Bucket } from "../../bucket/sim-s3-bucket.js";
import { simS3ConditionContext } from "../authorize/sim-s3-condition-context.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";

interface HeadBucketAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies IAM authorization to an S3 HeadBucket request.
 *
 * Real S3 authorizes this against `s3:ListBucket`, since knowing a Bucket is
 * there is the same knowledge a listing gives away. It shares the action with
 * a listing and not the condition keys: a HeadBucket names no prefix and asks
 * for no keys, so `s3:prefix` and `s3:max-keys` are absent rather than empty,
 * and a policy conditioned on either does not match one.
 */
export class HeadBucketAuthorizer {
  private static readonly action = "s3:ListBucket";

  private readonly iam: SimIamInterServiceAuthZ;

  constructor(properties: HeadBucketAuthorizerProperties) {
    this.iam = properties.iam;
  }

  /**
   * Ensure the caller may know this Bucket is there.
   */
  authorize(bucket: SimS3Bucket, options?: SimS3RequestOptions): void {
    const resource = `arn:aws:s3:::${bucket.bucketName}`;
    const policy = bucket.getPolicy();
    const decision = this.iam.authorize({
      action: HeadBucketAuthorizer.action,
      resource,
      caller: options?.caller,
      conditionContext: simS3ConditionContext(options),
      resourcePolicies:
        policy === undefined
          ? []
          : [
              {
                document: policy,
                policyName: "BucketPolicy",
                resourceArn: resource,
              },
            ],
    });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        action: HeadBucketAuthorizer.action,
        resource,
      });
    }
  }
}
