import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import type { SimS3Bucket } from "../../bucket/sim-s3-bucket.js";
import { simS3ConditionContext } from "../authorize/sim-s3-condition-context.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";

interface GetObjectAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies IAM authorization to an S3 GetObject request.
 *
 * GetObject is authorized against the target Object ARN rather than the Bucket
 * ARN. An omitted caller is passed through to sim IAM so Account root fallback
 * behavior remains owned by IAM.
 *
 * The request's source ARN and source Account go in as condition keys, which is
 * what a Bucket policy written for a CloudFront origin access control is
 * conditioned on.
 */
export class GetObjectAuthorizer {
  private static readonly action = "s3:GetObject";

  private readonly iam: SimIamInterServiceAuthZ;

  constructor(properties: GetObjectAuthorizerProperties) {
    this.iam = properties.iam;
  }

  /**
   * Ensure the caller may read the requested S3 Object.
   */
  authorize(
    bucket: SimS3Bucket,
    key: string,
    options?: SimS3RequestOptions,
  ): void {
    const resource = `arn:aws:s3:::${bucket.bucketName}/${key}`;
    const policy = bucket.getPolicy();
    const decision = this.iam.authorize({
      action: GetObjectAuthorizer.action,
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
                resourceArn: `arn:aws:s3:::${bucket.bucketName}`,
              },
            ],
    });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        reason: decision.denialReason,
        action: GetObjectAuthorizer.action,
        resource,
      });
    }
  }
}
