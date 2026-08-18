import type { SimAwsResolvedCaller } from "../../../aws/caller/sim-aws-caller-resolver.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simS3BucketArn } from "../../bucket/sim-s3-bucket-arn.js";
import type { SimS3Bucket } from "../../bucket/sim-s3-bucket.js";
import { simS3BucketResourcePolicies } from "../authorize/sim-s3-bucket-resource-policies.js";
import { simS3ConditionContext } from "../authorize/sim-s3-condition-context.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";

interface SimS3MultipartAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies IAM authorization to the operations of a multipart upload.
 *
 * All six authorize the way PutObject does, against the ARN of the Object being
 * uploaded, because that is the write they add up to: a role written to allow a
 * caller to put an Object should let it put a large one without a second grant.
 * Real S3 splits them across finer-grained actions, which is a distinction a
 * caller that can already write the Object has no way to fail.
 *
 * ListMultipartUploads is the one that names no Object, and authorizes against
 * the Bucket, since asking what a Bucket has in flight is a question about the
 * Bucket.
 */
export class SimS3MultipartAuthorizer {
  private static readonly action = "s3:PutObject";

  private readonly iam: SimIamInterServiceAuthZ;

  constructor(properties: SimS3MultipartAuthorizerProperties) {
    this.iam = properties.iam;
  }

  /**
   * Ensure the caller may carry out this part of an upload.
   *
   * The resolved caller is returned rather than discarded, because it is the
   * only place in the request where the principal has been worked out, and the
   * Object event notification a completed upload raises has to say who caused
   * it.
   */
  authorize(
    bucket: SimS3Bucket,
    key: string | undefined,
    options?: SimS3RequestOptions,
  ): SimAwsResolvedCaller {
    const bucketArn = simS3BucketArn(bucket.bucketName);
    const resource = key === undefined ? bucketArn : `${bucketArn}/${key}`;
    const decision = this.iam.authorize({
      action: SimS3MultipartAuthorizer.action,
      resource,
      caller: options?.caller,
      conditionContext: simS3ConditionContext(options),
      resourcePolicies: simS3BucketResourcePolicies(bucket),
    });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        action: SimS3MultipartAuthorizer.action,
        resource,
      });
    }

    return decision.caller;
  }
}
