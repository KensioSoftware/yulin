import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";

interface ListBucketsAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies IAM authorization to an S3 ListBuckets request.
 *
 * AWS maps the ListBuckets API operation to the S3:ListAllMyBuckets IAM
 * action. Despite the action name, this permission does not use individual
 * Bucket ARNs. AWS documents it as an account-level listing permission whose
 * resource is "*".
 *
 * Authorization therefore applies to the complete operation. An allowed caller
 * receives the account's Bucket listing, subject to request pagination and
 * prefix filtering. A denied caller receives AccessDenied rather than a
 * filtered or empty result.
 */
export class ListBucketsAuthorizer {
  private static readonly action = "s3:ListAllMyBuckets";
  private static readonly resource = "*";

  private readonly iam: SimIamInterServiceAuthZ;

  constructor(properties: ListBucketsAuthorizerProperties) {
    this.iam = properties.iam;
  }

  /**
   * Ensure the caller may list the simulated Account's S3 Buckets.
   *
   * The caller is passed through unchanged so sim IAM can distinguish an
   * omitted caller, which defaults to Account root, from an explicit anonymous
   * caller, which has no identity policy permissions.
   */
  authorize(caller?: SimAwsCaller): void {
    const decision = this.iam.authorize({
      action: ListBucketsAuthorizer.action,
      resource: ListBucketsAuthorizer.resource,
      caller,
    });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        action: ListBucketsAuthorizer.action,
        resource: ListBucketsAuthorizer.resource,
      });
    }
  }
}
