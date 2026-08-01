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

// Which segment each of a customer's orders came back in.
const segmentsByCustomer = new Map<string, number[]>();

for (let segment = 0; segment < totalSegments; segment++) {
  const segmentPage = await dynamoDb.scan(
    new ScanCommand({
      TableName: "OrdersTable",
      Segment: segment,
      TotalSegments: totalSegments,
    }),
  );

  const items = segmentPage.Items ?? [];

  for (const item of items) {
    const customerId = item["customerId"]?.S ?? "";
    const segments = segmentsByCustomer.get(customerId) ?? [];

    segmentsByCustomer.set(customerId, [...segments, segment]);
  }
}

// The segments together are the whole table, with nothing read twice.
console.log(segmentsByCustomer.values().toArray().flat().length); // 8
console.log(segmentsByCustomer.size); // 4

// And each customer's two orders came back in one segment rather than split
// between two.
console.log(
  segmentsByCustomer
    .values()
    .map((segments) => new Set(segments).size)
    .toArray(),
);
// [ 1, 1, 1, 1 ]
