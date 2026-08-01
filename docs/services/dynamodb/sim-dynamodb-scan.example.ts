/**
 * Reading a whole table back, whatever partition keys it holds.
 */

import {
  CreateTableCommand,
  PutItemCommand,
  ScanCommand,
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

const written = [
  { customerId: "c-1", orderId: "2026-03" },
  { customerId: "c-1", orderId: "2026-01" },
  { customerId: "c-1", orderId: "2026-02" },
  { customerId: "c-2", orderId: "2026-04" },
  { customerId: "c-3", orderId: "2026-05" },
];

for (const order of written) {
  await dynamoDb.putItem(
    new PutItemCommand({
      TableName: "OrdersTable",
      Item: {
        customerId: { S: order.customerId },
        orderId: { S: order.orderId },
      },
    }),
  );
}

const page = await dynamoDb.scan(new ScanCommand({ TableName: "OrdersTable" }));

console.log(page.Count); // 5
console.log(page.ScannedCount); // 5

// The items under one partition key come back together, ascending by sort key.
console.log(
  page.Items?.filter((item) => item["customerId"]?.S === "c-1").map(
    (item) => item["orderId"]?.S,
  ),
);
// [ "2026-01", "2026-02", "2026-03" ]
