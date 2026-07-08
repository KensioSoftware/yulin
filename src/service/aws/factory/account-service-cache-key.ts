import type { SimAwsAccountId } from "../sim-aws-account.js";

export type SimAwsAccountServiceCacheServiceName =
  "cloudFront" | "iam" | "route53";

/**
 * Build a stable memo key for an account-scoped simulated service instance.
 *
 * Account-scoped services share one instance across all regions in an account,
 * but different services in the same account must not share the same memo
 * entry.
 * The key includes both the simulated AWS service name and the account ID that
 * owns the service state.
 *
 * Keep new account-scoped services in SimAwsAccountServiceCache on this key
 * format instead of adding separate Maps. That keeps cache behavior consistent
 * as more global/account-level simulated AWS services are added.
 */
export function accountServiceCacheKey(
  serviceName: SimAwsAccountServiceCacheServiceName,
  accountId: SimAwsAccountId,
): string {
  return `${serviceName}:${accountId}`;
}
