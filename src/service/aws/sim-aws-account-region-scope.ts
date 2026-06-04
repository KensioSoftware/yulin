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
import type { SimAwsServices } from "./sim-aws-services.js";
import { SimDynamoDb } from "../dynamodb/sim-dynamodb.js";
import { SimS3 } from "../s3/sim-s3.js";
import { Memo } from "../../util/memo/memo.js";
import { SimAws } from "./sim-aws.js";
import { DynamicFactory } from "@kensio/part-factory";
import type { SimS3GlobalRegistry } from "../s3/sim-s3-global-registry.js";

export type SimAccountRegionScopeKey = `${SimAwsAccountId}:${AwsRegionName}`;

/**
 * Combined simulated AWS Account and Region scope.
 */
export class SimAwsAccountRegionContainer implements SimAwsServices {
  private readonly memo = new Memo<object>();
  private readonly accountRegionScope;

  constructor(
    private readonly simAws: SimAws = new SimAws(),
    public readonly account: SimAwsAccount = this.simAws.account(),
    public readonly region: SimAwsRegion = this.simAws.region(),
    private readonly s3GlobalRegistry: SimS3GlobalRegistry = this.simAws.s3GlobalRegistry(),
  ) {
    this.accountRegionScope = {
      accountId: this.account.accountId,
      regionName: this.region.regionName,
    };
  }

  /**
   * Get the simulated DynamoDB service for this account and region.
   */
  dynamoDb(): SimDynamoDb {
    return this.memo.getOrCreate("dynamoDb", () => {
      return new SimDynamoDb(this.accountRegionScope, this.simAws.background);
    });
  }

  /**
   * Get the simulated S3 service for this account and region.
   */
  s3(): SimS3 {
    return this.memo.getOrCreate("s3", () => {
      return new SimS3(this.accountRegionScope, this.s3GlobalRegistry);
    });
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
