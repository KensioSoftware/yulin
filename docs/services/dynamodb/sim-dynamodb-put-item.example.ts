/**
 * Writing an item, and reading back the item it replaced.
 */

import { CreateTableCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const dynamoDb = simAws.dynamoDb();

await dynamoDb.createTable(
  new CreateTableCommand({
    TableName: "OrdersTable",
    KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "orderId", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST",
  }),
);
await simAws.backgroundTasksComplete();

const written = await dynamoDb.putItem(
  new PutItemCommand({
    TableName: "OrdersTable",
    Item: { orderId: { S: "order-1" }, total: { N: "19.99" } },
  }),
);

console.log(written.Attributes); // undefined

const replaced = await dynamoDb.putItem(
  new PutItemCommand({
    TableName: "OrdersTable",
    Item: { orderId: { S: "order-1" }, total: { N: "24.99" } },
    ReturnValues: "ALL_OLD",
  }),
);

console.log(replaced.Attributes?.["total"]?.N); // "19.99"
