/**
 * Reading a customer's orders back in sort key order.
 */

import {
  CreateTableCommand,
  PutItemCommand,
  QueryCommand,
} from "@aws-sdk/client-dynamodb";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const dynamoDb = simAws.dynamoDb();

await dynamoDb.createTable(
  new CreateTableCommand({
    TableName: "OrdersTable",
    KeySchema: [
      { AttributeName: "customerId", KeyType: "HASH" },
      { AttributeName: "orderId", KeyType: "RANGE" },
    ],
    AttributeDefinitions: [
      { AttributeName: "customerId", AttributeType: "S" },
      { AttributeName: "orderId", AttributeType: "S" },
    ],
    BillingMode: "PAY_PER_REQUEST",
  }),
);
await simAws.backgroundTasksComplete();

for (const orderId of ["2026-03-01", "2026-01-14", "2027-01-02"]) {
  await dynamoDb.putItem(
    new PutItemCommand({
      TableName: "OrdersTable",
      Item: { customerId: { S: "c-1" }, orderId: { S: orderId } },
    }),
  );
}

const page = await dynamoDb.query(
  new QueryCommand({
    TableName: "OrdersTable",
    KeyConditionExpression:
      "customerId = :customer AND begins_with(orderId, :prefix)",
    ExpressionAttributeValues: {
      ":customer": { S: "c-1" },
      ":prefix": { S: "2026-" },
    },
  }),
);

console.log(page.Items?.map((item) => item["orderId"]?.S));
// [ "2026-01-14", "2026-03-01" ]

console.log(page.Count); // 2
console.log(page.ScannedCount); // 2

// ScanIndexForward reads the collection backwards.
const newestFirst = await dynamoDb.query(
  new QueryCommand({
    TableName: "OrdersTable",
    KeyConditionExpression: "customerId = :customer",
    ExpressionAttributeValues: { ":customer": { S: "c-1" } },
    ScanIndexForward: false,
  }),
);

console.log(newestFirst.Items?.map((item) => item["orderId"]?.S));
// [ "2027-01-02", "2026-03-01", "2026-01-14" ]
