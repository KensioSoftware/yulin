import type { SimAwsPrincipal } from "../../../aws/caller/sim-aws-caller.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import type { SimS3BucketName } from "../../bucket/sim-s3-bucket.js";

interface GetObjectAuthorizerProps {
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies IAM authorization to an S3 GetObject request.
 *
 * GetObject is authorized against the target Object ARN rather than the Bucket
 * ARN. An omitted caller is passed through to sim IAM so Account root fallback
 * behavior remains owned by IAM.
 */
export class GetObjectAuthorizer {
  private static readonly action = "s3:GetObject";

  private readonly iam: SimIamInterServiceAuthZ;

  constructor(props: GetObjectAuthorizerProps) {
    this.iam = props.iam;
  }

  /**
   * Ensure the caller may read the requested S3 Object.
   */
  authorize(
    bucketName: SimS3BucketName,
    key: string,
    caller?: SimAwsPrincipal,
  ): void {
    const resource = `arn:aws:s3:::${bucketName}/${key}`;
    const decision = this.iam.authorize({
      action: GetObjectAuthorizer.action,
      resource,
      caller,
    });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        action: GetObjectAuthorizer.action,
        resource,
      });
    }
  }
}
