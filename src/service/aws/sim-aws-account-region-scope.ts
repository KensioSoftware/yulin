import {
  makeSimAwsAccountId,
  type SimAwsAccount,
  type SimAwsAccountId,
} from "./sim-aws-account.js";
import {
  type AwsRegionName,
  makeAwsRegionName,
  type SimAwsRegion,
} from "./sim-aws-region.js";
import type { NoSimAwsServices, SimAwsServiceMap } from "./sim-aws-services.js";
import { Memo } from "../../util/memo/memo.js";
import { SimAws } from "./sim-aws.js";
import { DynamicFactory } from "@kensio/part-factory";

export type SimAccountRegionScopeKey = `${SimAwsAccountId}:${AwsRegionName}`;

/**
 * Combined simulated AWS Account and Region scope.
 * This is the real Account/Region scope container for simulated services.
 */
export class SimAwsAccountRegionContainer<
  TServices extends SimAwsServiceMap = NoSimAwsServices,
> {
  private readonly memo = new Memo<unknown>();

  public readonly accountRegionScope: SimAwsAccountRegionScope;

  constructor(
    private readonly simAws: SimAws<TServices> = new SimAws<TServices>(),
    public readonly account: SimAwsAccount<TServices> = this.simAws.account(),
    public readonly region: SimAwsRegion<TServices> = this.simAws.region(),
  ) {
    this.accountRegionScope = {
      accountId: this.account.accountId,
      regionName: this.region.regionName,
    };
  }

  /**
   * Get an installed simulated AWS service for this account and region.
   * The service must be installed with the appropriate installer function
   * first.
   */
  service<TKey extends keyof TServices>(serviceName: TKey): TServices[TKey] {
    return this.memo.getOrCreate(String(serviceName), () =>
      this.simAws.createService(serviceName, this),
    );
  }

  /**
   * Get an installed simulated AWS service by runtime service name.
   *
   * This is useful for optional cross-service dependencies, where one simulated
   * service can use another if it has been independently installed.
   */
  _requireService<TService>(serviceName: PropertyKey): TService {
    return this.memo.getOrCreate(String(serviceName), () =>
      this.simAws._createRequiredService<TService>(serviceName, this),
    );
  }
}

export interface SimAwsAccountRegionScope {
  accountId: SimAwsAccountId;
  regionName: AwsRegionName;
}

/**
 * Generates fake simulated AWS resource scopes.
 */
export const simAwsAccountRegionScopeFactory =
  new DynamicFactory<SimAwsAccountRegionScope>(() => ({
    accountId: makeSimAwsAccountId(),
    regionName: makeAwsRegionName(),
  }));
