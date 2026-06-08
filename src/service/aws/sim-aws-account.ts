import type { AwsRegionName } from "./sim-aws-region.js";
import type { Brand } from "../../util/brand.type.js";
import type {
  NoSimAwsServices,
  SimAwsAccountRegionScopes,
  SimAwsServiceMap,
} from "./sim-aws-services.js";
import type { SimAwsAccountRegionContainer } from "./sim-aws-account-region-scope.js";
import { faker } from "@faker-js/faker";

export type SimAwsAccountId = Brand<string, "SimAwsAccountId">;

export const DEFAULT_SIM_AWS_ACCOUNT_ID = "888888888888" as SimAwsAccountId;

/**
 * Container for simulated AWS services in one AWS Account.
 * The real scope is Account/Region in SimAwsAccountRegionContainer.
 * So SimAwsAccount is like an intermediate navigation handler on the way to a
 * full Account/Region scope.
 */
export class SimAwsAccount<
  TServices extends SimAwsServiceMap = NoSimAwsServices,
> {
  constructor(
    private readonly accountRegionScopes: SimAwsAccountRegionScopes<TServices>,
    public readonly accountId: SimAwsAccountId = DEFAULT_SIM_AWS_ACCOUNT_ID,
  ) {}

  /**
   * Get a simulated AWS Region scoped for this Account.
   */
  region(regionName?: AwsRegionName): SimAwsAccountRegionContainer<TServices> {
    return this.accountRegionScopes.accountRegionScope(
      this.accountId,
      regionName,
    );
  }

  /**
   * Get an installed simulated AWS service for this Account's default Region.
   * The service must be installed with the appropriate installer function
   * first.
   */
  service<TKey extends keyof TServices>(serviceName: TKey): TServices[TKey] {
    return this.region().service(serviceName);
  }
}

/**
 * Generate a fake AWS Account ID.
 */
export function makeSimAwsAccountId(): SimAwsAccountId {
  return faker.string.numeric({ length: 12 }) as SimAwsAccountId;
}
