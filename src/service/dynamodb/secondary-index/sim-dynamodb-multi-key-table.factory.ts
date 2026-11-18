import { AsyncMappedFactory } from "@kensio/part-factory";
import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimAws } from "../../aws/sim-aws.js";
import type { SimDynamoDbAttributeValue } from "../command/item/item.types.js";
import type { SimDynamoDbTable } from "../table/sim-dynamodb-table.js";

/**
 * What a test asks for when it wants a table with a multi-attribute index.
 */
export interface SimDynamoDbMultiKeyTableInput {
  readonly tableName: string;
  readonly indexName: string;
  readonly orders: readonly Readonly<
    Record<string, SimDynamoDbAttributeValue>
  >[];
}

/**
 * One order, placed in a region and warehouse, with a status and a priority.
 */
function order(
  orderId: string,
  status: string,
  priority: number,
): Readonly<Record<string, SimDynamoDbAttributeValue>> {
  return {
    orderId: { S: orderId },
    region: { S: "north" },
    warehouse: { S: "w1" },
    status: { S: status },
    priority: { N: priority.toString() },
  };
}

/**
 * Creates a table with a global secondary index keyed by several attributes.
 *
 * The table is keyed by `orderId`. The index `byWarehouse` takes `region` and
 * `warehouse` as its partition key and sorts by `status`, then `priority` (a
 * number), then `orderId`. The default orders all sit in one warehouse, and
 * their sort key values are chosen so that each sort key attribute decides
 * the order of some of them.
 *
 * ```typescript
 * const table = await simDynamoDbMultiKeyTableFactory.make({}, simAws);
 * ```
 */
export const simDynamoDbMultiKeyTableFactory = new AsyncMappedFactory<
  SimDynamoDbMultiKeyTableInput,
  SimDynamoDbTable,
  SimAws
>(
  () => ({
    tableName: "OrdersTable",
    indexName: "byWarehouse",
    orders: [
      order("order-1", "SHIPPED", 2),
      order("order-2", "OPEN", 10),
      order("order-3", "OPEN", 9),
      order("order-4", "OPEN", 9),
      order("order-5", "PACKED", 1),
    ],
  }),
  async (input, simAws) => {
    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDb.createTable({
      input: {
        TableName: input.tableName,
        KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
        AttributeDefinitions: [
          { AttributeName: "orderId", AttributeType: "S" },
          { AttributeName: "region", AttributeType: "S" },
          { AttributeName: "warehouse", AttributeType: "S" },
          { AttributeName: "status", AttributeType: "S" },
          { AttributeName: "priority", AttributeType: "N" },
        ],
        BillingMode: "PAY_PER_REQUEST",
        GlobalSecondaryIndexes: [
          {
            IndexName: input.indexName,
            KeySchema: [
              { AttributeName: "region", KeyType: "HASH" },
              { AttributeName: "warehouse", KeyType: "HASH" },
              { AttributeName: "status", KeyType: "RANGE" },
              { AttributeName: "priority", KeyType: "RANGE" },
              { AttributeName: "orderId", KeyType: "RANGE" },
            ],
            Projection: { ProjectionType: "ALL" },
          },
        ],
      },
    });
    await simAws.backgroundTasksComplete();

    await Promise.all(
      input.orders.map(async (item) =>
        simDynamoDb.putItem({
          input: { TableName: input.tableName, Item: item },
        }),
      ),
    );

    const table = simDynamoDb.findTable(input.tableName);
    assertDefined(
      table,
      `Simulated DynamoDB created the table ${input.tableName} and then did ` +
        `not hold it`,
    );

    return table;
  },
);
