import type { SimDynamoDb } from "../dynamodb/sim-dynamodb.js";
import type { SimS3 } from "../s3/sim-s3.js";
import type { SimAwsAccountId } from "./sim-aws-account.js";
import type { AwsRegionName } from "./sim-aws-region.js";
import type { SimAwsAccountRegionScope } from "./sim-aws-account-region-scope.js";

/**
 * Interface for accessing AWS services within a simulated AWS.
 */
export interface SimAwsServices {
  dynamoDb(): SimDynamoDb;
  s3(): SimS3;
}

/**
 * Interface for accessing combined simulated AWS Account Region scopes.
 */
export interface SimAwsAccountRegionScopes {
  accountRegionScope(
    accountId?: SimAwsAccountId,
    regionName?: AwsRegionName,
  ): SimAwsAccountRegionScope;
}
