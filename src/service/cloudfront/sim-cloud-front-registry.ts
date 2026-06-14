import {
  makeDistributionId,
  type SimCloudFrontDistributionId,
} from "./distribution/sim-cloudfront-distribution.js";
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
   * Allocate a globally unique simulated CloudFront Distribution ID.
   */
  allocateDistributionId(): SimCloudFrontDistributionId {
    let distributionId = makeDistributionId();

    while (this.distributionAccountIds.has(distributionId)) {
      /* v8 ignore next -- does not happen in practice */
      distributionId = makeDistributionId();
    }

    return distributionId;
  }

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

  /**
   * Get the Account ID which owns a simulated CloudFront Distribution ID.
   */
  accountIdForDistribution(
    distributionId: SimCloudFrontDistributionId,
  ): SimAwsAccountId | undefined {
    return this.distributionAccountIds.get(distributionId);
  }

  /**
   * Get Account IDs which currently own simulated CloudFront Distributions.
   */
  accountIdsWithDistributions(): Iterable<SimAwsAccountId> {
    return this.accountDistributionIds.keys();
  }
}
