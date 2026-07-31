import { parseSimArn } from "../../aws/arn.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import {
  SimDynamoDbUnsupportedOperation,
  SimDynamoDbValidationException,
} from "../error/dynamodb.error.js";
import { SimDynamoDbTableName } from "./sim-dynamodb-table-name.js";

/**
 * Read the table a request names in its `TableName` parameter.
 *
 * Real DynamoDB takes either the table's name or its full ARN there, so a
 * caller holding an ARN from CloudFormation or from a CreateTable response can
 * pass it straight through.
 */
export function readSimDynamoDbTableReference(
  value: string | undefined,
  accountRegionScope: SimAwsAccountRegionScope,
): SimDynamoDbTableName {
  if (value?.startsWith("arn:") === true) {
    return tableNameInArn(value, accountRegionScope);
  }

  return SimDynamoDbTableName.required(value);
}

/**
 * Read the table name out of a table ARN.
 *
 * An ARN for another Account or Region names a table this simulated DynamoDB
 * does not hold. Answering with the local table of that name would let a test
 * pass while the real call crossed a boundary it has no permission for, so it
 * is refused instead.
 */
function tableNameInArn(
  value: string,
  accountRegionScope: SimAwsAccountRegionScope,
): SimDynamoDbTableName {
  const arn = parseSimArn(value);

  if (arn?.service !== "dynamodb" || arn.resourceType !== "table") {
    throw new SimDynamoDbValidationException(
      `TableName '${value}' is not a table ARN`,
    );
  }

  if (
    arn.accountId !== accountRegionScope.accountId ||
    arn.region !== accountRegionScope.regionName
  ) {
    throw new SimDynamoDbUnsupportedOperation(
      `TableName '${value}' names a table in another Account or Region, and ` +
        `cross-account table access is not simulated`,
    );
  }

  return SimDynamoDbTableName.of(arn.resourceId);
}
