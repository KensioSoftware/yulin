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

/**
 * The ARN an index of a table has in an Account and Region.
 *
 * It is the table's ARN with `/index/` and the index name after it, the form
 * the service authorization reference gives the `index` resource type. Like
 * the table, the index need not exist.
 */
export function simDynamoDbIndexArn(
  accountRegionScope: SimAwsAccountRegionScope,
  tableName: string,
  indexName: string,
): SimArn {
  return `${simDynamoDbTableArn(accountRegionScope, tableName)}/index/${indexName}`;
}

/**
 * The ARN a read is authorized against: the table's, or the index's when the
 * read names one.
 */
export function simDynamoDbReadArn(
  accountRegionScope: SimAwsAccountRegionScope,
  tableName: string,
  indexName: string | undefined,
): SimArn {
  if (indexName === undefined) {
    return simDynamoDbTableArn(accountRegionScope, tableName);
  }

  return simDynamoDbIndexArn(accountRegionScope, tableName, indexName);
}
