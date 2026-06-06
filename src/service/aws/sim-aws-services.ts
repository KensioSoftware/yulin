import type { SimAwsAccountId } from "./sim-aws-account.js";
import type { AwsRegionName } from "./sim-aws-region.js";
import type { SimAwsAccountRegionContainer } from "./sim-aws-account-region-scope.js";

/**
 * Empty installed service map for a simulated AWS environment.
 */
export type NoSimAwsServices = Record<never, never>;

/**
 * Installed service map for a simulated AWS environment.
 */
export type SimAwsServiceMap = object;

/**
 * Runtime factory for creating a simulated AWS service in an Account Region scope.
 */
export type SimAwsServiceFactory = (
  scope: SimAwsAccountRegionContainer<SimAwsServiceMap>,
) => unknown;

/**
 * Interface for accessing combined simulated AWS Account Region scopes.
 */
export interface SimAwsAccountRegionScopes<
  TServices extends SimAwsServiceMap = NoSimAwsServices,
> {
  accountRegionScope(
    accountId?: SimAwsAccountId,
    regionName?: AwsRegionName,
  ): SimAwsAccountRegionContainer<TServices>;
}
