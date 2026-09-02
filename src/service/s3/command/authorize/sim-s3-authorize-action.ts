import type { SimAwsResolvedCaller } from "../../../aws/caller/sim-aws-caller-resolver.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import type { SimS3Bucket } from "../../bucket/sim-s3-bucket.js";
import { simS3BucketResourcePolicies } from "./sim-s3-bucket-resource-policies.js";
import { simS3ConditionContext } from "./sim-s3-condition-context.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";

/** One S3 request, as the decision to allow it is asked for. */
export interface SimS3AuthorizedAction {
  readonly iam: SimIamInterServiceAuthZ;
  /** The real IAM action, such as `s3:PutObjectRetention`. */
  readonly action: string;
  /** The Bucket ARN or the Object ARN, whichever the action is granted on. */
  readonly resource: string;
  /** The Bucket whose own policy is part of the decision. */
  readonly bucket: SimS3Bucket;
  readonly options: SimS3RequestOptions | undefined;
}

/**
 * Ensure one caller may take one action on one S3 resource.
 *
 * The Bucket's own policy is part of every decision, alongside whatever the
 * caller's identity policies say, and the request's source ARN and Account are
 * supplied as the condition keys a Bucket policy is usually written against.
 * An omitted caller is passed through to sim IAM, so Account root fallback
 * stays owned by IAM.
 *
 * The resolved caller is answered rather than discarded, because this is the
 * only point in a request where the principal has been worked out, and an
 * Object event notification has to say who caused it.
 */
export function simS3AuthorizeAction(
  request: SimS3AuthorizedAction,
): SimAwsResolvedCaller {
  const { iam, action, resource, bucket, options } = request;

  const decision = iam.authorize({
    action,
    resource,
    caller: options?.caller,
    conditionContext: simS3ConditionContext(options),
    resourcePolicies: simS3BucketResourcePolicies(bucket),
  });

  if (decision.isDenied) {
    throw new SimIamAccessDenied({
      principal: decision.caller.principal,
      reason: decision.denialReason,
      action,
      resource,
    });
  }

  return decision.caller;
}
