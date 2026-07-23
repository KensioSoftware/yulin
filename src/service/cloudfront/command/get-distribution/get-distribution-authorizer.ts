import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import type { SimCloudFrontDistributionId } from "../../distribution/sim-cloudfront-distribution.js";

interface GetDistributionAuthorizerProperties {
  readonly accountId: SimAwsAccountId;
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies IAM authorization to a CloudFront GetDistribution request.
 *
 * Authorization is performed against the requested Distribution ARN before the
 * Distribution map is inspected, preventing unauthorized callers from learning
 * whether a Distribution ID exists.
 */
export class GetDistributionAuthorizer {
  private static readonly action = "cloudfront:GetDistribution";

  private readonly accountId: SimAwsAccountId;
  private readonly iam: SimIamInterServiceAuthZ;

  constructor(properties: GetDistributionAuthorizerProperties) {
    this.accountId = properties.accountId;
    this.iam = properties.iam;
  }

  /**
   * Ensure the caller may retrieve the named CloudFront Distribution.
   */
  authorize(
    distributionId: SimCloudFrontDistributionId | string,
    caller?: SimAwsCaller,
  ): void {
    const resource = `arn:aws:cloudfront::${this.accountId}:distribution/${distributionId}`;
    const decision = this.iam.authorize({
      action: GetDistributionAuthorizer.action,
      resource,
      caller,
    });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        action: GetDistributionAuthorizer.action,
        resource,
      });
    }
  }
}
