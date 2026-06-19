import {
  DEFAULT_SIM_AWS_ACCOUNT_ID,
  type SimAwsAccount,
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
  type SimAwsRegion,
} from "./sim-aws-region.js";
import type { SimAwsAccountRegionContainer } from "./sim-aws-account-region-scope.js";
import type { SimS3 } from "../s3/sim-s3.js";
import type { SimCloudFront } from "../cloudfront/sim-cloudfront.js";
import type { SimCloudFrontRegistry } from "../cloudfront/sim-cloud-front-registry.js";
import type { SimDynamoDb } from "../dynamodb/index.js";
import type { SimCloudFormation } from "../cloudformation/index.js";
import { SimAwsServiceFactory } from "./factory/sim-aws-service-factory.js";
import { SimAwsScopeRegistry } from "./scope/sim-aws-scope-registry.js";

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
  private readonly scopes: SimAwsScopeRegistry;

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
    this.scopes = new SimAwsScopeRegistry({ simAws: this });
  }

  /**
   * Get a simulated AWS Account.
   */
  account(
    accountId: SimAwsAccountId | string = this.defaultAccountId,
  ): SimAwsAccount {
    return this.scopes.account(accountId as SimAwsAccountId);
  }

  /**
   * Get a simulated AWS Account Region scope.
   */
  region(regionName: AwsRegionName = this.defaultRegionName): SimAwsRegion {
    return this.scopes.region(regionName);
  }

  /**
   * Get an Account Region scope in this simulated AWS.
   */
  accountRegionScope(
    accountId: SimAwsAccountId = this.defaultAccountId,
    regionName: AwsRegionName = this.defaultRegionName,
  ): SimAwsAccountRegionContainer {
    return this.scopes.accountRegionScope(accountId, regionName);
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
