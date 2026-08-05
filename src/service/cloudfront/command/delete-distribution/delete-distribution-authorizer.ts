import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import type { SimCloudFrontDistributionId } from "../../distribution/sim-cloudfront-distribution.js";

interface DeleteDistributionAuthorizerProperties {
  readonly accountId: SimAwsAccountId;
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies IAM authorization to a CloudFront DeleteDistribution request.
 *
 * DeleteDistribution authorizes against the specific Distribution ARN, so a
 * policy can grant deleting one Distribution without granting deleting every
 * Distribution in the Account.
 *
 * Authorization happens before the Distribution map is read, so an
 * unauthorized caller gets AccessDenied whether the Distribution exists or
 * not.
 */
export class DeleteDistributionAuthorizer {
  private static readonly action = "cloudfront:DeleteDistribution";

  private readonly accountId: SimAwsAccountId;
  private readonly iam: SimIamInterServiceAuthZ;

  constructor(properties: DeleteDistributionAuthorizerProperties) {
    this.accountId = properties.accountId;
    this.iam = properties.iam;
  }

  /**
   * Ensure the caller may delete the named CloudFront Distribution.
   */
  authorize(
    distributionId: SimCloudFrontDistributionId | string,
    caller?: SimAwsCaller,
  ): void {
    const resource = `arn:aws:cloudfront::${this.accountId}:distribution/${distributionId}`;
    const decision = this.iam.authorize({
      action: DeleteDistributionAuthorizer.action,
      resource,
      caller,
    });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        action: DeleteDistributionAuthorizer.action,
        resource,
      });
    }
  }
}
