import { DynamicFactory } from "@kensio/part-factory";
import { makeSimAwsAccountId } from "./sim-aws-account.js";
import { makeAwsRegionName } from "./sim-aws-region.js";
import type { SimAwsAccountRegionScope } from "./sim-aws-account-region-scope.js";

/**
 * Generates fake simulated AWS resource scopes.
 */
export const simAwsAccountRegionScopeFactory =
  new DynamicFactory<SimAwsAccountRegionScope>(() => ({
    accountId: makeSimAwsAccountId(),
    regionName: makeAwsRegionName(),
  }));
