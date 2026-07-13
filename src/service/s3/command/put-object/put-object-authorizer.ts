import type { SimAwsPrincipal } from "../../../aws/caller/sim-aws-caller.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import type { SimS3BucketName } from "../../bucket/sim-s3-bucket.js";

interface PutObjectAuthorizerProps {
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies IAM authorization to an S3 PutObject request.
 *
 * PutObject is authorized against the target Object ARN rather than the Bucket
 * ARN. An omitted caller is passed through to sim IAM so Account root fallback
 * behavior remains owned by IAM.
 */
export class PutObjectAuthorizer {
  private static readonly action = "s3:PutObject";

  private readonly iam: SimIamInterServiceAuthZ;

  constructor(props: PutObjectAuthorizerProps) {
    this.iam = props.iam;
  }

  /**
   * Ensure the caller may create or replace the requested S3 Object.
   */
  authorize(
    bucketName: SimS3BucketName,
    key: string,
    caller?: SimAwsPrincipal,
  ): void {
    const resource = `arn:aws:s3:::${bucketName}/${key}`;
    const decision = this.iam.authorize({
      action: PutObjectAuthorizer.action,
      resource,
      caller,
    });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        action: PutObjectAuthorizer.action,
        resource,
      });
    }
  }
}
