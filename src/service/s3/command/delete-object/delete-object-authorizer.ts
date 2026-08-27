import type { SimAwsResolvedCaller } from "../../../aws/caller/sim-aws-caller-resolver.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simS3BucketArn } from "../../bucket/sim-s3-bucket-arn.js";
import type { SimS3Bucket } from "../../bucket/sim-s3-bucket.js";
import { simS3BucketResourcePolicies } from "../authorize/sim-s3-bucket-resource-policies.js";
import { simS3ConditionContext } from "../authorize/sim-s3-condition-context.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";

interface DeleteObjectAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies IAM authorization to an S3 DeleteObject request.
 *
 * DeleteObject is authorized against the target Object ARN rather than the
 * Bucket ARN, as the other Object commands are. An omitted caller is passed
 * through to sim IAM so Account root fallback behaviour remains owned by IAM.
 *
 * DeleteObjects authorizes each key through this same class, because real S3
 * evaluates `s3:DeleteObject` per Object in a batch and reports the keys it
 * refused alongside the ones it removed.
 */
export class DeleteObjectAuthorizer {
  private static readonly action = "s3:DeleteObject";

  private readonly iam: SimIamInterServiceAuthZ;

  constructor(properties: DeleteObjectAuthorizerProperties) {
    this.iam = properties.iam;
  }

  /**
   * Ensure the caller may remove the requested S3 Object.
   *
   * The resolved caller is returned rather than discarded, because it is the
   * only place in the request where the principal has been worked out, and an
   * Object event notification has to say who caused it.
   */
  authorize(
    bucket: SimS3Bucket,
    key: string,
    options?: SimS3RequestOptions,
  ): SimAwsResolvedCaller {
    const resource = `${simS3BucketArn(bucket.bucketName)}/${key}`;
    const decision = this.iam.authorize({
      action: DeleteObjectAuthorizer.action,
      resource,
      caller: options?.caller,
      conditionContext: simS3ConditionContext(options),
      resourcePolicies: simS3BucketResourcePolicies(bucket),
    });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        reason: decision.denialReason,
        action: DeleteObjectAuthorizer.action,
        resource,
      });
    }

    return decision.caller;
  }
}
