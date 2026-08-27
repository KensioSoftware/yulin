import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simS3BucketArn } from "../../bucket/sim-s3-bucket-arn.js";
import type { SimS3Bucket } from "../../bucket/sim-s3-bucket.js";
import { simS3BucketResourcePolicies } from "../authorize/sim-s3-bucket-resource-policies.js";
import { simS3ConditionContext } from "../authorize/sim-s3-condition-context.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";

interface SimS3LifecycleAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies IAM authorization to the S3 lifecycle configuration commands.
 *
 * Reading is governed by s3:GetLifecycleConfiguration. Both replacing and
 * removing the configuration are governed by s3:PutLifecycleConfiguration:
 * real S3 has no separate delete permission, so removing the rules needs
 * exactly what setting them needs. Neither action name carries "Bucket", which
 * is where they differ from the rest of the Bucket configuration actions.
 */
export class SimS3LifecycleAuthorizer {
  private static readonly readAction = "s3:GetLifecycleConfiguration";
  private static readonly writeAction = "s3:PutLifecycleConfiguration";

  private readonly iam: SimIamInterServiceAuthZ;

  constructor(properties: SimS3LifecycleAuthorizerProperties) {
    this.iam = properties.iam;
  }

  /**
   * Ensure the caller may read the Bucket's lifecycle rules.
   */
  authorizeRead(bucket: SimS3Bucket, options?: SimS3RequestOptions): void {
    this.authorize(SimS3LifecycleAuthorizer.readAction, bucket, options);
  }

  /**
   * Ensure the caller may replace or remove the Bucket's lifecycle rules.
   */
  authorizeWrite(bucket: SimS3Bucket, options?: SimS3RequestOptions): void {
    this.authorize(SimS3LifecycleAuthorizer.writeAction, bucket, options);
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
