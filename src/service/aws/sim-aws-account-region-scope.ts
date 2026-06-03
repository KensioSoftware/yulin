import type { SimAwsAccount, SimAwsAccountId } from "./sim-aws-account.js";
import type { SimAwsRegion, AwsRegionName } from "./sim-aws-region.js";
import type { SimAwsServices } from "./sim-aws-services.js";
import { SimDynamoDb } from "../dynamodb/dynamodb.js";
import { SimS3 } from "../s3/s3.js";
import { Memo } from "../../util/memo/memo.js";
import type { SimAws } from "./sim-aws.js";

export type SimAccountRegionScopeKey = `${SimAwsAccountId}:${AwsRegionName}`;

/**
 * Combined simulated AWS Account and Region scope.
 */
export class SimAwsAccountRegionScope implements SimAwsServices {
  private readonly memo = new Memo<object>();

  constructor(
    private readonly simAws: SimAws,
    public readonly account: SimAwsAccount = this.simAws.account(),
    public readonly region: SimAwsRegion = this.simAws.region(),
  ) {}

  /**
   * Get the simulated DynamoDB service for this account and region.
   */
  dynamoDb(): SimDynamoDb {
    return this.memo.getOrCreate("dynamoDb", () => {
      return new SimDynamoDb(
        this.account.accountId,
        this.region.regionName,
        this.simAws.background,
      );
    });
  }

  /**
   * Get the simulated S3 service for this account and region.
   */
  s3(): SimS3 {
    return this.memo.getOrCreate("s3", () => {
      return new SimS3();
    });
  }
}
