/**
 * Writing an item, reading it back, and deleting it.
 */

import {
  CreateTableCommand,
  DeleteItemCommand,
  GetItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";

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

await dynamoDb.putItem(
  new PutItemCommand({
    TableName: "OrdersTable",
    Item: { orderId: { S: "order-1" }, total: { N: "19.99" } },
  }),
);

const found = await dynamoDb.getItem(
  new GetItemCommand({
    TableName: "OrdersTable",
    Key: { orderId: { S: "order-1" } },
  }),
);

console.log(found.Item?.["total"]?.N); // "19.99"

const removed = await dynamoDb.deleteItem(
  new DeleteItemCommand({
    TableName: "OrdersTable",
    Key: { orderId: { S: "order-1" } },
    ReturnValues: "ALL_OLD",
  }),
);

console.log(removed.Attributes?.["total"]?.N); // "19.99"

const missing = await dynamoDb.getItem(
  new GetItemCommand({
    TableName: "OrdersTable",
    Key: { orderId: { S: "order-1" } },
  }),
);

console.log(missing.Item); // undefined
