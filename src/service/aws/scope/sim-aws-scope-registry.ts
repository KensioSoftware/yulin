import { SimAwsAccount, type SimAwsAccountId } from "../sim-aws-account.js";
import { type AwsRegionName, SimAwsRegion } from "../sim-aws-region.js";
import {
  type SimAccountRegionScopeKey,
  SimAwsAccountRegionContainer,
} from "../sim-aws-account-region-scope.js";
import type { SimAws } from "../sim-aws.js";

interface SimAwsScopeRegistryProperties {
  readonly simAws: SimAws;
}

/**
 * Registry for simulated AWS Account, Region, and Account/Region scope objects.
 *
 * This owns scope object lifetime so the top-level SimAws facade can delegate
 * scope navigation without also owning the underlying scope caches.
 */
export class SimAwsScopeRegistry {
  private readonly simAws: SimAws;

  private readonly accounts = new Map<SimAwsAccountId, SimAwsAccount>();

  private readonly regions = new Map<AwsRegionName, SimAwsRegion>();

  private readonly accountRegionScopes = new Map<
    SimAccountRegionScopeKey,
    SimAwsAccountRegionContainer
  >();

  constructor(properties: SimAwsScopeRegistryProperties) {
    this.simAws = properties.simAws;
  }

  /**
   * Get a simulated AWS Account.
   */
  account(accountId: SimAwsAccountId): SimAwsAccount {
    let account = this.accounts.get(accountId);

    if (account === undefined) {
      account = new SimAwsAccount({
        simAws: this.simAws,
        accountId,
      });
      this.accounts.set(accountId, account);
    }

    return account;
  }

  /**
   * Get a simulated AWS Region.
   */
  region(regionName: AwsRegionName): SimAwsRegion {
    let region = this.regions.get(regionName);

    if (region === undefined) {
      region = new SimAwsRegion({
        simAws: this.simAws,
        regionName,
      });
      this.regions.set(regionName, region);
    }

    return region;
  }

  /**
   * Get an Account/Region scope in this simulated AWS.
   */
  accountRegionScope(
    accountId: SimAwsAccountId,
    regionName: AwsRegionName,
  ): SimAwsAccountRegionContainer {
    const scopeKey = `${accountId}:${regionName}` as const;
    let accountRegionScope = this.accountRegionScopes.get(scopeKey);

    if (accountRegionScope === undefined) {
      accountRegionScope = new SimAwsAccountRegionContainer({
        simAws: this.simAws,
        account: this.account(accountId),
        region: this.region(regionName),
      });
      this.accountRegionScopes.set(scopeKey, accountRegionScope);
    }

    return accountRegionScope;
  }

  /**
   * Let go of everything the scopes in this registry are holding open.
   *
   * Every Account Region scope that has been reached for, rather than the
   * default one alone, because a simulation deploying into a second Account or
   * Region starts its watches there and they hold the process open just the
   * same. A registry nothing has been asked of has nothing to close.
   */
  async close(): Promise<void> {
    await Promise.all(
      this.accountRegionScopes.values().map(async (accountRegionScope) => {
        await accountRegionScope.close();
      }),
    );
  }
}
