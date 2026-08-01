/**
 * Reading a customer's open orders, and counting what that cost.
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

const orders = [
  { orderId: "2026-01", status: "OPEN" },
  { orderId: "2026-02", status: "SHIPPED" },
  { orderId: "2026-03", status: "OPEN" },
  { orderId: "2026-04", status: "SHIPPED" },
];

for (const order of orders) {
  await dynamoDb.putItem(
    new PutItemCommand({
      TableName: "OrdersTable",
      Item: {
        customerId: { S: "c-1" },
        orderId: { S: order.orderId },
        status: { S: order.status },
      },
    }),
  );
}

const page = await dynamoDb.query(
  new QueryCommand({
    TableName: "OrdersTable",
    KeyConditionExpression: "customerId = :customer",
    FilterExpression: "#status = :open",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: {
      ":customer": { S: "c-1" },
      ":open": { S: "OPEN" },
    },
    Limit: 3,
  }),
);

console.log(page.Items?.map((item) => item["orderId"]?.S));
// [ "2026-01", "2026-03" ]

// Three items were read, and two of them survived the filter.
console.log(page.ScannedCount); // 3
console.log(page.Count); // 2

// There is more to read, even though the page came back shorter than the Limit.
console.log(page.LastEvaluatedKey?.["orderId"]?.S); // "2026-03"

// Select COUNT counts the same read and answers with no items at all.
const counted = await dynamoDb.query(
  new QueryCommand({
    TableName: "OrdersTable",
    KeyConditionExpression: "customerId = :customer",
    FilterExpression: "#status = :open",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: {
      ":customer": { S: "c-1" },
      ":open": { S: "OPEN" },
    },
    Select: "COUNT",
  }),
);

console.log(counted.Count); // 2
console.log(counted.ScannedCount); // 4
console.log(counted.Items); // undefined
