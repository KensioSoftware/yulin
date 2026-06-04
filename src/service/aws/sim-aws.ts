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
  SimAwsAccountRegionScopes,
  SimAwsServices,
} from "./sim-aws-services.js";
import type { SimS3 } from "../s3/sim-s3.js";
import type { SimDynamoDb } from "../dynamodb/sim-dynamodb.js";
import {
  type SimAccountRegionScopeKey,
  SimAwsAccountRegionContainer,
} from "./sim-aws-account-region-scope.js";
import { Memo } from "../../util/memo/memo.js";
import { SimS3GlobalRegistry } from "../s3/sim-s3-global-registry.js";

/**
 * Top-level container for simulated AWS.
 */
export class SimAws implements SimAwsServices, SimAwsAccountRegionScopes {
  private readonly accounts = new Map<SimAwsAccountId, SimAwsAccount>();
  private readonly regions = new Map<AwsRegionName, SimAwsRegion>();
  private readonly accountRegionScopes = new Map<
    SimAccountRegionScopeKey,
    SimAwsAccountRegionContainer
  >();

  private readonly memo = new Memo<object>();

  constructor(
    public readonly defaultAccountId = DEFAULT_SIM_AWS_ACCOUNT_ID,
    public readonly defaultRegionName = DEFAULT_SIM_AWS_REGION_NAME,
    public readonly background: BackgroundScheduler &
      BackgroundCompleter = new BackgroundTasks(),
  ) {}

  /**
   * Get a simulated AWS Account.
   */
  account(accountId: string = this.defaultAccountId): SimAwsAccount {
    let account = this.accounts.get(accountId as SimAwsAccountId);

    if (account === undefined) {
      account = new SimAwsAccount(this, accountId as SimAwsAccountId);
      this.accounts.set(accountId as SimAwsAccountId, account);
    }

    return account;
  }

  /**
   * Get a simulated AWS Account Region scope.
   */
  region(regionName: AwsRegionName = this.defaultRegionName): SimAwsRegion {
    let region = this.regions.get(regionName);

    if (region === undefined) {
      region = new SimAwsRegion(this, regionName);
      this.regions.set(regionName, region);
    }

    return region;
  }

  /**
   * Get an Account Region scope in this simulated AWS.
   */
  accountRegionScope(
    accountId: SimAwsAccountId = this.defaultAccountId,
    regionName: AwsRegionName = this.defaultRegionName,
  ): SimAwsAccountRegionContainer {
    const scopeKey = `${accountId}:${regionName}` as const;
    let accountRegionScope = this.accountRegionScopes.get(scopeKey);

    if (accountRegionScope === undefined) {
      accountRegionScope = new SimAwsAccountRegionContainer(
        this,
        this.account(accountId),
        this.region(regionName),
        this.s3GlobalRegistry(),
      );
      this.accountRegionScopes.set(scopeKey, accountRegionScope);
    }

    return accountRegionScope;
  }

  /**
   * Get the simulated global S3 registry for this AWS environment.
   */
  s3GlobalRegistry(): SimS3GlobalRegistry {
    return this.memo.getOrCreate(
      "s3GlobalRegistry",
      () => new SimS3GlobalRegistry(),
    );
  }

  /**
   * Get a simulated DynamoDB service in the default Account Region scope.
   */
  dynamoDb(): SimDynamoDb {
    return this.accountRegionScope().dynamoDb();
  }

  /**
   * Get a simulated S3 service in the default Account Region scope.
   */
  s3(): SimS3 {
    return this.accountRegionScope().s3();
  }

  /**
   * Wait for all outstanding background tasks to complete.
   */
  async backgroundTasksComplete(): Promise<void> {
    await this.background.complete();
  }
}
