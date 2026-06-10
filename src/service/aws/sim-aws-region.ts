import type { SimAwsAccountId } from "./sim-aws-account.js";
import type { SimAwsAccountRegionContainer } from "./sim-aws-account-region-scope.js";
import { faker } from "@faker-js/faker";
import type { SimS3 } from "../s3/sim-s3.js";
import type { SimCloudFront } from "../cloudfront/sim-cloudfront.js";
import type { SimDynamoDb } from "../dynamodb/index.js";
import { SimAws } from "./sim-aws.js";

export const AWS_REGION_NAMES = [
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  "af-south-1",
  "ap-east-1",
  "ap-south-2",
  "ap-southeast-3",
  "ap-southeast-5",
  "ap-southeast-4",
  "ap-south-1",
  "ap-southeast-6",
  "ap-northeast-3",
  "ap-northeast-2",
  "ap-southeast-1",
  "ap-southeast-2",
  "ap-east-2",
  "ap-southeast-7",
  "ap-northeast-1",
  "ca-central-1",
  "ca-west-1",
  "eu-central-1",
  "eu-west-1",
  "eu-west-2",
  "eu-south-1",
  "eu-west-3",
  "eu-south-2",
  "eu-north-1",
  "eu-central-2",
  "il-central-1",
  "mx-central-1",
  "me-south-1",
  "me-central-1",
  "sa-east-1",
] as const;

export type AwsRegionName = (typeof AWS_REGION_NAMES)[number];

export const DEFAULT_SIM_AWS_REGION_NAME = "us-east-1" as const;

/**
 * Container for simulated AWS services in one AWS Region.
 * The real scope is Account/Region in SimAwsAccountRegionContainer.
 * So SimAwsRegion is like an intermediate navigation handler on the way to a
 * full Account/Region scope.
 */
export class SimAwsRegion {
  constructor(
    private readonly accountRegionScopes: Pick<
      SimAws,
      "accountRegionScope"
    > = new SimAws(),
    public readonly regionName: AwsRegionName = DEFAULT_SIM_AWS_REGION_NAME,
  ) {}

  /**
   * Get a simulated AWS Account scoped for this Region.
   */
  account(accountId?: SimAwsAccountId | string): SimAwsAccountRegionContainer {
    return this.accountRegionScopes.accountRegionScope(
      accountId as SimAwsAccountId,
      this.regionName,
    );
  }

  /**
   * Get simulated S3 for this Region's default Account.
   */
  s3(): SimS3 {
    return this.account().s3();
  }

  /**
   * Get simulated CloudFront for this Region's default Account.
   */
  cloudFront(): SimCloudFront {
    return this.account().cloudFront();
  }

  /**
   * Get simulated DynamoDB for this Region's default Account.
   */
  dynamoDb(): SimDynamoDb {
    return this.account().dynamoDb();
  }
}

/**
 * Choose a random AWS Region name.
 */
export function makeAwsRegionName(): AwsRegionName {
  return faker.helpers.arrayElement(AWS_REGION_NAMES);
}
