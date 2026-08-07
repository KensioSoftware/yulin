import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import type { SimS3Bucket } from "../../bucket/sim-s3-bucket.js";
import { simS3ConditionContext } from "../authorize/sim-s3-condition-context.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";

interface ListObjectsAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

interface ListObjectsAuthorizationInput {
  readonly bucket: SimS3Bucket;
  readonly prefix?: string | undefined;
  readonly maxKeys: number;
  readonly options?: SimS3RequestOptions | undefined;
}

/**
 * Applies IAM authorization to an S3 ListObjects request.
 *
 * AWS authorizes both ListObjects and ListObjectsV2 with the `s3:ListBucket`
 * action. The resource is the Bucket ARN because listing examines a Bucket's
 * key namespace rather than reading any individual Object.
 *
 * Prefix and maximum-result constraints are request attributes used by IAM
 * policies to limit which listings a principal may perform. They are supplied
 * as S3 condition keys so policy evaluation can distinguish, for example, a
 * permitted app prefix from a restricted private prefix.
 */
export class ListObjectsAuthorizer {
  private static readonly action = "s3:ListBucket";

  private readonly iam: SimIamInterServiceAuthZ;

  constructor(properties: ListObjectsAuthorizerProperties) {
    this.iam = properties.iam;
  }

  /**
   * Ensure the caller may list the requested portion of the Bucket namespace.
   */
  authorize(input: ListObjectsAuthorizationInput): void {
    const resource = `arn:aws:s3:::${input.bucket.bucketName}`;
    const policy = input.bucket.getPolicy();
    const decision = this.iam.authorize({
      action: ListObjectsAuthorizer.action,
      resource,
      caller: input.options?.caller,
      conditionContext: {
        ...simS3ConditionContext(input.options),
        "s3:prefix": input.prefix ?? "",
        "s3:max-keys": input.maxKeys,
      },
      resourcePolicies:
        policy === undefined
          ? []
          : [
              {
                document: policy,
                policyName: "BucketPolicy",
                resourceArn: resource,
              },
            ],
    });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        action: ListObjectsAuthorizer.action,
        resource,
      });
    }
  }
}
