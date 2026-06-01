import type { BackgroundScheduler } from "../../util/background/background.js";
import type { Brand } from "../../util/brand.type.js";
import { Memo } from "../../util/memo/memo.js";
import { SimDynamoDb } from "../dynamodb/dynamodb.js";
import { SimS3 } from "../s3/s3.js";

export type AwsRegionName = Brand<string, "AwsRegionName">;

export const DEFAULT_SIM_AWS_REGION = "us-east-1" as AwsRegionName;

/**
 * Container for simulated AWS services in one Region.
 */
export class SimAwsRegion {
  private readonly memo = new Memo<object>();

  constructor(private readonly background: BackgroundScheduler) {}

  /**
   * Get the simulated DynamoDB service in this simulated Region.
   */
  getDynamoDb(): SimDynamoDb {
    return this.memo.getOrCreate(
      "DynamoDB",
      () => new SimDynamoDb(this.background),
    );
  }

  /**
   * Get the simulated S3 service in this simulated Region.
   */
  getS3(): SimS3 {
    return this.memo.getOrCreate("S3", () => new SimS3());
  }
}
