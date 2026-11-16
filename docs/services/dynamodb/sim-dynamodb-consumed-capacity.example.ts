/**
 * Reading the capacity a write and a read consumed.
 */

import {
  CreateTableCommand,
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

// About 1.5 KB, which a write rounds up to 2 KB.
const put = await dynamoDb.putItem(
  new PutItemCommand({
    TableName: "OrdersTable",
    Item: { orderId: { S: "order-1" }, notes: { S: "x".repeat(1500) } },
    ReturnConsumedCapacity: "TOTAL",
  }),
);

console.log(put.ConsumedCapacity?.WriteCapacityUnits); // 2

// A read rounds up to 4 KB, and an eventually consistent one costs half.
const read = await dynamoDb.getItem(
  new GetItemCommand({
    TableName: "OrdersTable",
    Key: { orderId: { S: "order-1" } },
    ReturnConsumedCapacity: "TOTAL",
  }),
);

console.log(read.ConsumedCapacity?.ReadCapacityUnits); // 0.5
