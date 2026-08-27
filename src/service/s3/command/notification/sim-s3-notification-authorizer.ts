import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simS3BucketArn } from "../../bucket/sim-s3-bucket-arn.js";
import type { SimS3Bucket } from "../../bucket/sim-s3-bucket.js";
import { simS3BucketResourcePolicies } from "../authorize/sim-s3-bucket-resource-policies.js";
import { simS3ConditionContext } from "../authorize/sim-s3-condition-context.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";

interface SimS3NotificationAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies IAM authorization to the S3 event notification commands.
 *
 * The IAM action names do not match the API names: reading the configuration
 * is governed by s3:GetBucketNotification and replacing it by
 * s3:PutBucketNotification, while the operations are called
 * GetBucketNotificationConfiguration and PutBucketNotificationConfiguration.
 * `sim-s3-public-access-block-authorizer.ts` has the same mismatch for the same
 * reason: the permission is older than the operation name.
 */
export class SimS3NotificationAuthorizer {
  private static readonly readAction = "s3:GetBucketNotification";
  private static readonly writeAction = "s3:PutBucketNotification";

  private readonly iam: SimIamInterServiceAuthZ;

  constructor(properties: SimS3NotificationAuthorizerProperties) {
    this.iam = properties.iam;
  }

  /**
   * Ensure the caller may read the Bucket's notification configuration.
   */
  authorizeRead(bucket: SimS3Bucket, options?: SimS3RequestOptions): void {
    this.authorize(SimS3NotificationAuthorizer.readAction, bucket, options);
  }

  /**
   * Ensure the caller may replace the Bucket's notification configuration.
   */
  authorizeWrite(bucket: SimS3Bucket, options?: SimS3RequestOptions): void {
    this.authorize(SimS3NotificationAuthorizer.writeAction, bucket, options);
  }

  private authorize(
    action: string,
    bucket: SimS3Bucket,
    options?: SimS3RequestOptions,
  ): void {
    const resource = simS3BucketArn(bucket.bucketName);
    const decision = this.iam.authorize({
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
  }
}
