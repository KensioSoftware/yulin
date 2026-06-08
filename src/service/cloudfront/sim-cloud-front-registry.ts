import type { SimCloudFrontDistributionId } from "./distribution/sim-cloudfront-distribution.js";
import type { SimAwsAccountId } from "../aws/sim-aws-account.js";

/**
 * Simulated CloudFront cross-Account registry of Distribution IDs.
 *
 * CloudFront is not region-scoped, so all region-scoped CloudFront service
 * instances for the same Account should delegate to the same Account-global
 * state.
 */
export class SimCloudFrontRegistry {
  private readonly distributionAccountIds = new Map<
    SimCloudFrontDistributionId,
    SimAwsAccountId
  >();

  private readonly accountDistributionIds = new Map<
    SimAwsAccountId,
    Set<SimCloudFrontDistributionId>
  >();

  /**
   * Register a simulated CloudFront Distribution ID to an Account ID.
   */
  registerDistribution(
    distributionId: SimCloudFrontDistributionId,
    accountId: SimAwsAccountId,
  ): void {
    this.distributionAccountIds.set(distributionId, accountId);

    let accountDistributions = this.accountDistributionIds.get(accountId);

    if (accountDistributions === undefined) {
      accountDistributions = new Set<SimCloudFrontDistributionId>();
      this.accountDistributionIds.set(accountId, accountDistributions);
    }

    accountDistributions.add(distributionId);
  }
}
