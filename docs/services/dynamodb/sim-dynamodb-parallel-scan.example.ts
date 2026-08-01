/**
 * Reading a table in four segments.
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

for (const customerId of ["c-1", "c-2", "c-3", "c-4"]) {
  for (const orderId of ["2026-01", "2026-02"]) {
    await dynamoDb.putItem(
      new PutItemCommand({
        TableName: "OrdersTable",
        Item: { customerId: { S: customerId }, orderId: { S: orderId } },
      }),
    );
  }
}

const totalSegments = 4;
const read: string[] = [];

for (let segment = 0; segment < totalSegments; segment++) {
  const segmentPage = await dynamoDb.scan(
    new ScanCommand({
      TableName: "OrdersTable",
      Segment: segment,
      TotalSegments: totalSegments,
    }),
  );

  read.push(
    ...(segmentPage.Items ?? []).map((item) => item["customerId"]?.S ?? ""),
  );
}

// The segments together are the whole table, with nothing read twice.
console.log(read.length); // 8

// And each customer's orders arrived in one segment, both of them together.
console.log(new Set(read).size); // 4
