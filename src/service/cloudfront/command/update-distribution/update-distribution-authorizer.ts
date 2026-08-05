import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import type { SimCloudFrontDistributionId } from "../../distribution/sim-cloudfront-distribution.js";

interface UpdateDistributionAuthorizerProperties {
  readonly accountId: SimAwsAccountId;
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies IAM authorization to a CloudFront UpdateDistribution request.
 *
 * Authorization is against the specific Distribution ARN, and happens before
 * the Distribution map is read, so an unauthorized caller gets AccessDenied
 * whether the Distribution exists or not.
 */
export class UpdateDistributionAuthorizer {
  private static readonly action = "cloudfront:UpdateDistribution";

  private readonly accountId: SimAwsAccountId;
  private readonly iam: SimIamInterServiceAuthZ;

  constructor(properties: UpdateDistributionAuthorizerProperties) {
    this.accountId = properties.accountId;
    this.iam = properties.iam;
  }

  /**
   * Ensure the caller may update the named CloudFront Distribution.
   */
  authorize(
    distributionId: SimCloudFrontDistributionId | string,
    caller?: SimAwsCaller,
  ): void {
    const resource = `arn:aws:cloudfront::${this.accountId}:distribution/${distributionId}`;
    const decision = this.iam.authorize({
      action: UpdateDistributionAuthorizer.action,
      resource,
      caller,
    });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        action: UpdateDistributionAuthorizer.action,
        resource,
      });
    }
  }
}
