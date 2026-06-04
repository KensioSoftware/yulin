import type { SimDynamoDb } from "../dynamodb/sim-dynamodb.js";
import type { AwsRegionName } from "./sim-aws-region.js";
import type { SimS3 } from "../s3/sim-s3.js";
import type { Brand } from "../../util/brand.type.js";
import type {
  SimAwsAccountRegionScopes,
  SimAwsServices,
} from "./sim-aws-services.js";
import type { SimAwsAccountRegionContainer } from "./sim-aws-account-region-scope.js";
import { faker } from "@faker-js/faker";

export type SimAwsAccountId = Brand<string, "SimAwsAccountId">;

export const DEFAULT_SIM_AWS_ACCOUNT_ID = "888888888888" as SimAwsAccountId;

/**
 * Container for simulated AWS services in one AWS Account.
 */
export class SimAwsAccount implements SimAwsServices {
  constructor(
    private readonly accountRegionScopes: SimAwsAccountRegionScopes,
    public readonly accountId: SimAwsAccountId = DEFAULT_SIM_AWS_ACCOUNT_ID,
  ) {}

  /**
   * Get a simulated AWS Region scoped for this Account.
   */
  region(regionName?: AwsRegionName): SimAwsAccountRegionContainer {
    return this.accountRegionScopes.accountRegionScope(
      this.accountId,
      regionName,
    );
  }

  /**
   * Get the simulated DynamoDB service for this Account.
   */
  dynamoDb(): SimDynamoDb {
    return this.region().dynamoDb();
  }

  /**
   * Get the simulated S3 service for this Account.
   */
  s3(): SimS3 {
    return this.region().s3();
  }
}

/**
 * Generate a fake AWS Account ID.
 */
export function makeSimAwsAccountId(): SimAwsAccountId {
  return faker.string.numeric({ length: 12 }) as SimAwsAccountId;
}
