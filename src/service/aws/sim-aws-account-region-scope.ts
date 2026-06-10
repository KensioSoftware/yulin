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
import { Memo } from "../../util/memo/memo.js";
import { SimAws } from "./sim-aws.js";
import { DynamicFactory } from "@kensio/part-factory";
import type { SimS3 } from "../s3/sim-s3.js";
import type { SimCloudFront } from "../cloudfront/sim-cloudfront.js";
import type { SimDynamoDb } from "../dynamodb/index.js";

export type SimAccountRegionScopeKey = `${SimAwsAccountId}:${AwsRegionName}`;

interface SimAwsAccountRegionContainerProps {
  readonly simAws?: SimAws;
  readonly account?: SimAwsAccount;
  readonly region?: SimAwsRegion;
}

/**
 * Combined simulated AWS Account and Region scope.
 * This is the real Account/Region scope container for simulated services.
 */
export class SimAwsAccountRegionContainer {
  private readonly simAws: SimAws;
  public readonly account: SimAwsAccount;
  public readonly region: SimAwsRegion;
  private readonly memo = new Memo<unknown>();

  public readonly accountRegionScope: SimAwsAccountRegionScope;

  constructor(props: SimAwsAccountRegionContainerProps = {}) {
    const { simAws = new SimAws(), account, region } = props;

    this.simAws = simAws;
    this.account =
      account ??
      this.simAws.account((account as SimAwsAccount | undefined)?.accountId);
    this.region =
      region ??
      this.simAws.region((region as SimAwsRegion | undefined)?.regionName);

    this.accountRegionScope = {
      accountId: this.account.accountId,
      regionName: this.region.regionName,
    };
  }

  /**
   * Get simulated S3 for this account and region.
   */
  s3(): SimS3 {
    return this.memo.getOrCreate("s3", () => this.simAws._createS3(this));
  }

  /**
   * Get simulated CloudFront for this account.
   */
  cloudFront(): SimCloudFront {
    return this.memo.getOrCreate("cloudFront", () =>
      this.simAws._createCloudFront(this),
    );
  }

  /**
   * Get simulated DynamoDB for this account and region.
   */
  dynamoDb(): SimDynamoDb {
    return this.memo.getOrCreate("dynamoDb", () =>
      this.simAws._createDynamoDb(this),
    );
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
