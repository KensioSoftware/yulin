import {
  type BackgroundCompleter,
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import type { SimDynamoDb } from "../dynamodb/dynamodb.js";
import { Memo } from "../../util/memo/memo.js";
import {
  type AwsRegionName,
  DEFAULT_SIM_AWS_REGION,
  SimAwsRegion,
} from "./sim-aws-region.js";
import type { SimS3 } from "../s3/s3.js";

/**
 * Container for simulated AWS services.
 */
export class SimAwsAccount {
  private readonly memo = new Memo<object>();

  private readonly defaultRegion = DEFAULT_SIM_AWS_REGION;

  constructor(
    private readonly background: BackgroundScheduler &
      BackgroundCompleter = new BackgroundTasks(),
  ) {}

  /**
   * Wait for all outstanding background tasks in this Account to complete.
   */
  async backgroundTasksComplete(): Promise<void> {
    await this.background.complete();
  }

  /**
   * Get a simulated AWS Region in this simulated Account.
   */
  getRegion(region?: AwsRegionName): SimAwsRegion {
    return this.memo.getOrCreate(
      `Region:${region ?? this.defaultRegion}`,
      () => new SimAwsRegion(this.background),
    );
  }

  /**
   * Get the simulated DynamoDB service in this simulated Account.
   */
  getDynamoDb(): SimDynamoDb {
    return this.getRegion().getDynamoDb();
  }

  /**
   * Get the simulated S3 service in this simulated Account.
   */
  getS3(): SimS3 {
    return this.getRegion().getS3();
  }
}
