import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsResolvedCaller } from "../../../aws/caller/sim-aws-caller-resolver.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import type { SimS3Bucket } from "../../bucket/sim-s3-bucket.js";

interface PutObjectAuthorizerProperties {
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

  constructor(properties: PutObjectAuthorizerProperties) {
    this.iam = properties.iam;
  }

  /**
   * Ensure the caller may create or replace the requested S3 Object.
   *
   * The resolved caller is returned rather than discarded, because it is the
   * only place in the request where the principal has been worked out, and an
   * Object event notification has to say who caused it.
   */
  authorize(
    bucket: SimS3Bucket,
    key: string,
    caller?: SimAwsCaller,
  ): SimAwsResolvedCaller {
    const resource = `arn:aws:s3:::${bucket.bucketName}/${key}`;
    const policy = bucket.getPolicy();
    const decision = this.iam.authorize({
      action: PutObjectAuthorizer.action,
      resource,
      caller,
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
        action: PutObjectAuthorizer.action,
        resource,
      });
    }

    return decision.caller;
  }
}
