import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import type { SimS3BucketName } from "../../bucket/sim-s3-bucket.js";

interface PutBucketPolicyAuthorizerProps {
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies IAM authorization to an S3 PutBucketPolicy request.
 */
export class PutBucketPolicyAuthorizer {
  private static readonly action = "s3:PutBucketPolicy";

  private readonly iam: SimIamInterServiceAuthZ;

  constructor(props: PutBucketPolicyAuthorizerProps) {
    this.iam = props.iam;
  }

  /**
   * Ensure the caller may replace the Bucket policy.
   */
  authorize(bucketName: SimS3BucketName, caller?: SimAwsCaller): void {
    const resource = `arn:aws:s3:::${bucketName}`;
    const decision = this.iam.authorize({
      action: PutBucketPolicyAuthorizer.action,
      resource,
      caller,
    });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        action: PutBucketPolicyAuthorizer.action,
        resource,
      });
    }
  }
}
