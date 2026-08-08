import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import type { SimS3BucketName } from "../../bucket/sim-s3-bucket.js";
import { simS3ConditionContext } from "../authorize/sim-s3-condition-context.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";

interface PutBucketWebsiteAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies IAM authorization to an S3 PutBucketWebsite request.
 *
 * The command handler owns request validation, Bucket lookup, and website state
 * changes. This class owns the IAM-specific translation from an S3 Bucket name
 * to the action and resource IAM evaluates.
 *
 * Keeping that translation here prevents authorization details from becoming
 * mixed with command orchestration. It also provides one place to maintain the
 * action name, S3 Bucket ARN format, and access-denied error construction.
 */
export class PutBucketWebsiteAuthorizer {
  private static readonly action = "s3:PutBucketWebsite";

  private readonly iam: SimIamInterServiceAuthZ;

  constructor(properties: PutBucketWebsiteAuthorizerProperties) {
    this.iam = properties.iam;
  }

  /**
   * Ensure the caller may replace the Bucket's website configuration.
   *
   * PutBucketWebsite is authorized against the Bucket ARN rather than an object
   * ARN because website configuration belongs to the Bucket itself. An omitted
   * caller is passed through to sim IAM, which applies its Account root fallback.
   * An explicit anonymous caller remains anonymous and receives the normal
   * implicit-deny result.
   *
   * This method returns only for an allowed decision. A denied decision becomes
   * the service-shaped access error expected by callers of the S3 simulation.
   */
  authorize(bucketName: SimS3BucketName, options?: SimS3RequestOptions): void {
    const resource = `arn:aws:s3:::${bucketName}`;
    const decision = this.iam.authorize({
      action: PutBucketWebsiteAuthorizer.action,
      resource,
      caller: options?.caller,
      conditionContext: simS3ConditionContext(options),
    });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        action: PutBucketWebsiteAuthorizer.action,
        resource,
      });
    }
  }
}
