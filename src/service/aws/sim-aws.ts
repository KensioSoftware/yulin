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
  type AwsRegionName,
  DEFAULT_SIM_AWS_REGION_NAME,
  SimAwsRegion,
} from "./sim-aws-region.js";
import {
  type SimAccountRegionScopeKey,
  SimAwsAccountRegionContainer,
} from "./sim-aws-account-region-scope.js";
import type { SimS3 } from "../s3/sim-s3.js";
import type { SimCloudFront } from "../cloudfront/sim-cloudfront.js";
import type { SimCloudFrontRegistry } from "../cloudfront/sim-cloud-front-registry.js";
import type { SimDynamoDb } from "../dynamodb/index.js";
import type { SimCloudFormation } from "../cloudformation/index.js";
import { SimAwsServiceFactory } from "./factory/sim-aws-service-factory.js";

interface SimAwsProps {
  readonly defaultAccountId?: SimAwsAccountId;
  readonly defaultRegionName?: AwsRegionName;
  readonly background?: BackgroundScheduler & BackgroundCompleter;
}

/**
 * Top-level container for simulated AWS.
 * Contains Account scopes, Region scopes, Account/Region scopes, and built-in
 * simulated AWS services.
 */
export class SimAws {
  public readonly defaultAccountId: SimAwsAccountId;
  public readonly defaultRegionName: AwsRegionName;
  public readonly _serviceFactory: SimAwsServiceFactory;
  private readonly background: BackgroundScheduler & BackgroundCompleter;

  private readonly accounts = new Map<SimAwsAccountId, SimAwsAccount>();

  private readonly regions = new Map<AwsRegionName, SimAwsRegion>();

  private readonly accountRegionScopes = new Map<
    SimAccountRegionScopeKey,
    SimAwsAccountRegionContainer
  >();

  constructor(props: SimAwsProps = {}) {
    const {
      defaultAccountId = DEFAULT_SIM_AWS_ACCOUNT_ID,
      defaultRegionName = DEFAULT_SIM_AWS_REGION_NAME,
      background = new BackgroundTasks(),
    } = props;

    this.defaultAccountId = defaultAccountId;
    this.defaultRegionName = defaultRegionName;
    this.background = background;
    this._serviceFactory = new SimAwsServiceFactory({
      simAws: this,
      background,
    });
  }

  /**
   * Get a simulated AWS Account.
   */
  account(accountId: string = this.defaultAccountId): SimAwsAccount {
    let account = this.accounts.get(accountId as SimAwsAccountId);

    if (account === undefined) {
      account = new SimAwsAccount({
        simAws: this,
        accountId: accountId as SimAwsAccountId,
      });
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
      region = new SimAwsRegion({
        simAws: this,
        regionName,
      });
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
      accountRegionScope = new SimAwsAccountRegionContainer({
        simAws: this,
        account: this.account(accountId),
        region: this.region(regionName),
      });
      this.accountRegionScopes.set(scopeKey, accountRegionScope);
    }

    return accountRegionScope;
  }

  /**
   * Get simulated CloudFormation in the default Account Region scope.
   */
  cloudFormation(): SimCloudFormation {
    return this.accountRegionScope().cloudFormation();
  }

  /**
   * Get simulated CloudFront in the default Account scope.
   */
  cloudFront(): SimCloudFront {
    return this.accountRegionScope().cloudFront();
  }

  /**
   * Get simulated DynamoDB in the default Account Region scope.
   */
  dynamoDb(): SimDynamoDb {
    return this.accountRegionScope().dynamoDb();
  }

  /**
   * Get simulated S3 in the default Account Region scope.
   */
  s3(): SimS3 {
    return this.accountRegionScope().s3();
  }

  /**
   * Get the shared simulated CloudFront registry.
   *
   * This is intended for CloudFront service/controller wiring so request routing
   * uses the same registry as CloudFront SDK command handling.
   */
  _cloudFrontRegistry(): SimCloudFrontRegistry {
    return this._serviceFactory.cloudFrontRegistry();
  }

  /**
   * Wait for all outstanding background tasks to complete.
   */
  async backgroundTasksComplete(): Promise<void> {
    await this.background.complete();
  }
}
