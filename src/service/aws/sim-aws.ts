import {
  DEFAULT_SIM_AWS_ACCOUNT_ID,
  SimAwsAccount,
  type SimAwsAccountId,
} from "./sim-aws-account.js";
import {
  type BackgroundCompleter,
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import {
  DEFAULT_SIM_AWS_REGION_NAME,
  SimAwsRegion,
  type AwsRegionName,
} from "./sim-aws-region.js";
import type {
  NoSimAwsServices,
  SimAwsAccountRegionScopes,
  SimAwsServiceFactory,
  SimAwsServiceMap,
} from "./sim-aws-services.js";
import {
  type SimAccountRegionScopeKey,
  SimAwsAccountRegionContainer,
} from "./sim-aws-account-region-scope.js";
import type {
  SimAwsServiceController,
  SimAwsServiceControllerFactory,
} from "../../serve/controller/sim-service-controller.js";

/**
 * Top-level container for simulated AWS.
 * Contains Account scopes, Region scopes, Account/Region scopes.
 * Installers for each simulated service install services into the SimAws
 * container.
 * This allows for individual services to be installed as necessary, without
 * importing all of them from the root and requiring every AWS SDK to be
 * installed.
 */
export class SimAws<
  TServices extends SimAwsServiceMap = NoSimAwsServices,
> implements SimAwsAccountRegionScopes<TServices> {
  private readonly accounts = new Map<
    SimAwsAccountId,
    SimAwsAccount<SimAwsServiceMap>
  >();

  private readonly regions = new Map<
    AwsRegionName,
    SimAwsRegion<SimAwsServiceMap>
  >();

  private readonly accountRegionScopes = new Map<
    SimAccountRegionScopeKey,
    SimAwsAccountRegionContainer<SimAwsServiceMap>
  >();

  private readonly serviceFactories = new Map<
    PropertyKey,
    SimAwsServiceFactory
  >();

  private readonly serviceControllerFactories = new Map<
    string,
    SimAwsServiceControllerFactory
  >();

  constructor(
    public readonly defaultAccountId = DEFAULT_SIM_AWS_ACCOUNT_ID,
    public readonly defaultRegionName = DEFAULT_SIM_AWS_REGION_NAME,
    public readonly background: BackgroundScheduler &
      BackgroundCompleter = new BackgroundTasks(),
  ) {}

  /**
   * Get a simulated AWS Account.
   */
  account(accountId: string = this.defaultAccountId): SimAwsAccount<TServices> {
    let account = this.accounts.get(accountId as SimAwsAccountId);

    if (account === undefined) {
      account = new SimAwsAccount<SimAwsServiceMap>(
        this,
        accountId as SimAwsAccountId,
      );
      this.accounts.set(accountId as SimAwsAccountId, account);
    }

    return account as unknown as SimAwsAccount<TServices>;
  }

  /**
   * Get a simulated AWS Account Region scope.
   */
  region(
    regionName: AwsRegionName = this.defaultRegionName,
  ): SimAwsRegion<TServices> {
    let region = this.regions.get(regionName);

    if (region === undefined) {
      region = new SimAwsRegion<SimAwsServiceMap>(this, regionName);
      this.regions.set(regionName, region);
    }

    return region as unknown as SimAwsRegion<TServices>;
  }

  /**
   * Get an Account Region scope in this simulated AWS.
   */
  accountRegionScope(
    accountId: SimAwsAccountId = this.defaultAccountId,
    regionName: AwsRegionName = this.defaultRegionName,
  ): SimAwsAccountRegionContainer<TServices> {
    const scopeKey = `${accountId}:${regionName}` as const;
    let accountRegionScope = this.accountRegionScopes.get(scopeKey);

    if (accountRegionScope === undefined) {
      accountRegionScope = new SimAwsAccountRegionContainer<SimAwsServiceMap>(
        this,
        this.account(accountId),
        this.region(regionName),
      );
      this.accountRegionScopes.set(scopeKey, accountRegionScope);
    }

    return accountRegionScope as unknown as SimAwsAccountRegionContainer<TServices>;
  }

  /**
   * Install a simulated AWS service factory.
   */
  installService(
    serviceName: PropertyKey,
    factory: SimAwsServiceFactory,
  ): void {
    if (this.serviceFactories.has(serviceName)) {
      throw new Error(
        `Sim AWS service is already installed: ${String(serviceName)}`,
      );
    }
    this.serviceFactories.set(serviceName, factory);
  }

  /**
   * Install a simulated AWS HTTP service controller factory.
   */
  installServiceController(
    serviceName: string,
    factory: SimAwsServiceControllerFactory,
  ): void {
    if (this.serviceControllerFactories.has(serviceName)) {
      throw new Error(
        `Sim AWS service controller is already installed: ${serviceName}`,
      );
    }
    this.serviceControllerFactories.set(serviceName, factory);
  }

  /**
   * Create an installed simulated AWS service for an Account Region scope.
   */
  createService<TKey extends keyof TServices>(
    serviceName: TKey,
    scope: SimAwsAccountRegionContainer<TServices>,
  ): TServices[TKey] {
    const factory = this.serviceFactories.get(serviceName);

    if (factory === undefined) {
      throw new Error(
        `Sim AWS service is not installed: ${String(serviceName)}. Call installer function to install it.`,
      );
    }

    return factory(scope) as TServices[TKey];
  }

  /**
   * Create an installed simulated AWS HTTP service controller.
   */
  createServiceController(serviceName: string): SimAwsServiceController {
    const factory = this.serviceControllerFactories.get(serviceName);

    if (factory === undefined) {
      throw new Error(
        `No controller installed for simulated AWS service ${serviceName}`,
      );
    }

    return factory(this);
  }

  /**
   * Get an installed simulated AWS service in the default Account Region scope.
   * The service must be installed with the appropriate installer function
   * first.
   */
  service<TKey extends keyof TServices>(serviceName: TKey): TServices[TKey] {
    return this.accountRegionScope().service(serviceName);
  }

  /**
   * Wait for all outstanding background tasks to complete.
   */
  async backgroundTasksComplete(): Promise<void> {
    await this.background.complete();
  }
}
