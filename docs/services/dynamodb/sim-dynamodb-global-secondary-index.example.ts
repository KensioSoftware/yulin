/**
 * Declaring a global secondary index on a simulated table.
 */

import { CreateTableCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const dynamoDb = simAws.dynamoDb();

const creation = await dynamoDb.createTable(
  new CreateTableCommand({
    TableName: "OrdersTable",
    KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
    // Every index key attribute needs a definition, alongside the table's own.
    AttributeDefinitions: [
      { AttributeName: "orderId", AttributeType: "S" },
      { AttributeName: "status", AttributeType: "S" },
      { AttributeName: "orderedAt", AttributeType: "N" },
    ],
    BillingMode: "PAY_PER_REQUEST",
    GlobalSecondaryIndexes: [
      {
        IndexName: "byStatus",
        KeySchema: [
          { AttributeName: "status", KeyType: "HASH" },
          { AttributeName: "orderedAt", KeyType: "RANGE" },
        ],
        Projection: { ProjectionType: "ALL" },
      },
    ],
  }),
);

const index = creation.TableDescription?.GlobalSecondaryIndexes?.[0];
console.log(index?.IndexName); // "byStatus"
console.log(index?.IndexStatus); // "CREATING"
console.log(index?.IndexArn); // ".../table/OrdersTable/index/byStatus"

await simAws.backgroundTasksComplete();

// An item with no status is simply absent from the index, rather than refused.
await dynamoDb.putItem(
  new PutItemCommand({
    TableName: "OrdersTable",
    Item: { orderId: { S: "order-1" }, total: { N: "42" } },
  }),
);
