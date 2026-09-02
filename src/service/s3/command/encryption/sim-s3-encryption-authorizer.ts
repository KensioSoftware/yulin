import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simS3BucketArn } from "../../bucket/sim-s3-bucket-arn.js";
import type { SimS3Bucket } from "../../bucket/sim-s3-bucket.js";
import { simS3BucketResourcePolicies } from "../authorize/sim-s3-bucket-resource-policies.js";
import { simS3ConditionContext } from "../authorize/sim-s3-condition-context.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";

interface SimS3EncryptionAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies IAM authorization to the S3 Bucket encryption commands.
 *
 * Two actions for three commands. Real S3 governs both applying and removing a
 * default encryption configuration with s3:PutEncryptionConfiguration, since
 * removing one is applying the default in its place.
 */
export class SimS3EncryptionAuthorizer {
  private static readonly readAction = "s3:GetEncryptionConfiguration";
  private static readonly writeAction = "s3:PutEncryptionConfiguration";

  private readonly iam: SimIamInterServiceAuthZ;

  constructor(properties: SimS3EncryptionAuthorizerProperties) {
    this.iam = properties.iam;
  }

  /**
   * Ensure the caller may read the Bucket's default encryption.
   */
  authorizeRead(bucket: SimS3Bucket, options?: SimS3RequestOptions): void {
    this.authorize(SimS3EncryptionAuthorizer.readAction, bucket, options);
  }

  /**
   * Ensure the caller may change the Bucket's default encryption.
   */
  authorizeWrite(bucket: SimS3Bucket, options?: SimS3RequestOptions): void {
    this.authorize(SimS3EncryptionAuthorizer.writeAction, bucket, options);
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
