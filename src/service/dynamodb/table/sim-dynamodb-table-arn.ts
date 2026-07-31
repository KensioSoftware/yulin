import type { SimArn } from "../../aws/arn.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";

/**
 * The ARN a table has in an Account and Region.
 *
 * The table need not exist. CreateTable authorizes against the ARN the table is
 * about to have, as real IAM does before the service handles the request.
 */
export function simDynamoDbTableArn(
  accountRegionScope: SimAwsAccountRegionScope,
  tableName: string,
): SimArn {
  return `arn:aws:dynamodb:${accountRegionScope.regionName}:${accountRegionScope.accountId}:table/${tableName}`;
}
