import type {
  SimDynamoDbTableClass,
  SimDynamoDbTableClassSummary,
  SimDynamoDbTableDescription,
} from "../command/table/table.types.js";
import type { SimDynamoDbTable } from "./sim-dynamodb-table.js";
import type { SimDynamoDbTableFigures } from "./sim-dynamodb-table-statistics.js";

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
  const figures = table.figures;

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
    GlobalSecondaryIndexes: withFigures(
      table.indexes.global.descriptions(table.status),
      figures,
    ),
    LocalSecondaryIndexes: withFigures(
      table.indexes.local.descriptions(),
      figures,
    ),
    DeletionProtectionEnabled: table.deletionProtectionEnabled,
    StreamSpecification: table.stream.specification(),
    // These stay set once the table has had a stream, whether or not it still
    // has one, since they name the last stream rather than the current
    // setting. A table that has never had one reports neither.
    LatestStreamArn: table.stream.latest?.arn,
    LatestStreamLabel: table.stream.latest?.label,
    ItemCount: figures.itemCount,
    TableSizeBytes: figures.sizeBytes,
  };
}

/**
 * Index descriptions carrying the item count and size of each index, as of the
 * table's last refresh. An index added since then reports nothing yet.
 */
function withFigures<
  Description extends { readonly IndexName?: string | undefined },
>(
  descriptions: readonly Description[] | undefined,
  figures: SimDynamoDbTableFigures,
): readonly Description[] | undefined {
  return descriptions?.map((description) => {
    const index = figures.indexes.get(description.IndexName ?? "");

    return {
      ...description,
      ItemCount: index?.itemCount ?? 0,
      IndexSizeBytes: index?.sizeBytes ?? 0,
    };
  });
}
