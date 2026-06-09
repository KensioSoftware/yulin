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
import type { SimAwsServiceController } from "../../serve/controller/sim-service-controller.js";
import { SimS3 } from "../s3/sim-s3.js";
import { SimS3GlobalRegistry } from "../s3/sim-s3-global-registry.js";
import { SimS3ServiceController } from "../s3/serve/sim-s3-controller.js";
import { SimCloudFront } from "../cloudfront/sim-cloudfront.js";
import { SimCloudFrontRegistry } from "../cloudfront/sim-cloud-front-registry.js";
import { createSimCloudFrontS3OriginResolver } from "../cloudfront/origin/sim-cloudfront-s3-origin.js";
import { SimCloudFrontServiceController } from "../cloudfront/controller/sim-cloudfront-controller.js";
import { SimDynamoDb } from "../dynamodb/index.js";

/**
 * Top-level container for simulated AWS.
 * Contains Account scopes, Region scopes, Account/Region scopes, and built-in
 * simulated AWS services.
 */
export class SimAws {
  private readonly accounts = new Map<SimAwsAccountId, SimAwsAccount>();

  private readonly regions = new Map<AwsRegionName, SimAwsRegion>();

  private readonly accountRegionScopes = new Map<
    SimAccountRegionScopeKey,
    SimAwsAccountRegionContainer
  >();

  private readonly s3GlobalRegistry = new SimS3GlobalRegistry();

  private readonly cloudFrontRegistry = new SimCloudFrontRegistry();

  private readonly cloudFrontServices = new Map<
    SimAwsAccountId,
    SimCloudFront
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
      );
      this.accountRegionScopes.set(scopeKey, accountRegionScope);
    }

    return accountRegionScope;
  }

  /**
   * Get simulated S3 in the default Account Region scope.
   */
  s3(): SimS3 {
    return this.accountRegionScope().s3();
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
   * Create simulated S3 for an Account Region scope.
   */
  createS3(scope: SimAwsAccountRegionContainer): SimS3 {
    return new SimS3(scope.accountRegionScope, this.s3GlobalRegistry);
  }

  /**
   * Create or get simulated CloudFront for an Account scope.
   */
  createCloudFront(scope: SimAwsAccountRegionContainer): SimCloudFront {
    const { accountId } = scope.accountRegionScope;

    let cloudFront = this.cloudFrontServices.get(accountId);

    if (cloudFront === undefined) {
      cloudFront = new SimCloudFront(
        scope.accountRegionScope,
        this.cloudFrontRegistry,
        createSimCloudFrontS3OriginResolver(this, scope),
      );
      this.cloudFrontServices.set(accountId, cloudFront);
    }

    return cloudFront;
  }

  /**
   * Create simulated DynamoDB for an Account Region scope.
   */
  createDynamoDb(scope: SimAwsAccountRegionContainer): SimDynamoDb {
    return new SimDynamoDb(scope.accountRegionScope, this.background);
  }

  /**
   * Create a simulated AWS HTTP service controller.
   */
  createServiceController(serviceName: string): SimAwsServiceController {
    switch (serviceName) {
      case "s3": {
        return new SimS3ServiceController(this);
      }

      case "cloudFront": {
        return new SimCloudFrontServiceController(this.cloudFront());
      }

      default: {
        throw new Error(
          `No controller for simulated AWS service ${serviceName}`,
        );
      }
    }
  }

  /**
   * Wait for all outstanding background tasks to complete.
   */
  async backgroundTasksComplete(): Promise<void> {
    await this.background.complete();
  }
}
