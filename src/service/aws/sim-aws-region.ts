import type { SimAwsAccountId } from "./sim-aws-account.js";
import type { SimAwsAccountRegionScope } from "./sim-aws-account-region-scope.js";
import type {
  SimAwsAccountRegionScopes,
  SimAwsServices,
} from "./sim-aws-services.js";
import type { SimS3 } from "../s3/s3.js";
import type { SimDynamoDb } from "../dynamodb/dynamodb.js";

export type AwsRegionName =
  | "us-east-1"
  | "us-east-2"
  | "us-west-1"
  | "us-west-2"
  | "af-south-1"
  | "ap-east-1"
  | "ap-south-2"
  | "ap-southeast-3"
  | "ap-southeast-5"
  | "ap-southeast-4"
  | "ap-south-1"
  | "ap-southeast-6"
  | "ap-northeast-3"
  | "ap-northeast-2"
  | "ap-southeast-1"
  | "ap-southeast-2"
  | "ap-east-2"
  | "ap-southeast-7"
  | "ap-northeast-1"
  | "ca-central-1"
  | "ca-west-1"
  | "eu-central-1"
  | "eu-west-1"
  | "eu-west-2"
  | "eu-south-1"
  | "eu-west-3"
  | "eu-south-2"
  | "eu-north-1"
  | "eu-central-2"
  | "il-central-1"
  | "mx-central-1"
  | "me-south-1"
  | "me-central-1"
  | "sa-east-1";

export const DEFAULT_SIM_AWS_REGION_NAME = "us-east-1" as const;

/**
 * Simulated AWS Region.
 */
export class SimAwsRegion implements SimAwsServices {
  constructor(
    private readonly accountRegionScopes: SimAwsAccountRegionScopes,
    public readonly regionName: AwsRegionName = DEFAULT_SIM_AWS_REGION_NAME,
  ) {}

  /**
   * Get a simulated AWS Account scoped for this Region.
   */
  account(accountId?: SimAwsAccountId | string): SimAwsAccountRegionScope {
    return this.accountRegionScopes.accountRegionScope(
      accountId as SimAwsAccountId,
      this.regionName,
    );
  }

  /**
   * Get the simulated DynamoDB service scoped for this Region.
   */
  dynamoDb(): SimDynamoDb {
    return this.account().dynamoDb();
  }

  /**
   * Get the simulated S3 service scoped for this Region.
   */
  s3(): SimS3 {
    return this.account().s3();
  }
}
