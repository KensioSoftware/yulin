import type {
  SimDynamoDbTableClass,
  SimDynamoDbTableClassSummary,
  SimDynamoDbTableDescription,
} from "../command/table/table.types.js";
import type { SimDynamoDbTable } from "./sim-dynamodb-table.js";

/**
 * How a table reports its class, when the request that made it named one.
 */
function tableClassSummary(
  tableClass: SimDynamoDbTableClass | undefined,
): SimDynamoDbTableClassSummary | undefined {
  if (tableClass === undefined) {
    return undefined;
  }

  return { TableClass: tableClass };
}

/**
 * Describe a table the way DynamoDB reports it.
 *
 * CreateTable, DescribeTable and DeleteTable all answer with this same shape,
 * so it is built in one place from the table itself rather than from whichever
 * request happens to be asking.
 */
export function describeSimDynamoDbTable(
  table: SimDynamoDbTable,
): SimDynamoDbTableDescription {
  return {
    TableName: table.tableName,
    TableArn: table.arn,
    TableId: table.tableId,
    KeySchema: table.keySchema.elements,
    AttributeDefinitions: table.attributeDefinitions.elements,
    TableStatus: table.status,
    CreationDateTime: table.creationDateTime,
    BillingModeSummary: table.billing.summary(),
    ProvisionedThroughput: table.billing.throughputDescription(),
    TableClassSummary: tableClassSummary(table.tableClass),
    GlobalSecondaryIndexes: table.indexes.global.descriptions(table.status),
    LocalSecondaryIndexes: table.indexes.local.descriptions(),
    DeletionProtectionEnabled: table.deletionProtectionEnabled,
    // Neither figure is tracked yet. Real DynamoDB updates both about every
    // six hours, so they lag behind the items anyway.
    ItemCount: 0,
    TableSizeBytes: 0,
  };
}
