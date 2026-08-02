/**
 * Adding a global secondary index to a table that is already live.
 */

import {
  DescribeTableCommand,
  QueryCommand,
  UpdateTableCommand,
} from "@aws-sdk/client-dynamodb";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const dynamoDb = simAws.dynamoDb();

await dynamoDb.createTable({
  input: {
    TableName: "OrdersTable",
    KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "orderId", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST",
  },
});
await simAws.backgroundTasksComplete();

await dynamoDb.putItem({
  input: {
    TableName: "OrdersTable",
    Item: { orderId: { S: "order-1" }, status: { S: "OPEN" } },
  },
});

// The attributes the new index is keyed on are declared on the same call, which
// is the only chance to declare them.
await dynamoDb.updateTable(
  new UpdateTableCommand({
    TableName: "OrdersTable",
    AttributeDefinitions: [{ AttributeName: "status", AttributeType: "S" }],
    GlobalSecondaryIndexUpdates: [
      {
        Create: {
          IndexName: "byStatus",
          KeySchema: [{ AttributeName: "status", KeyType: "HASH" }],
          Projection: { ProjectionType: "ALL" },
        },
      },
    ],
  }),
);

const building = await dynamoDb.describeTable(
  new DescribeTableCommand({ TableName: "OrdersTable" }),
);

console.log(building.Table?.TableStatus); // "UPDATING"
console.log(building.Table?.GlobalSecondaryIndexes?.[0]?.IndexStatus); // "CREATING"
console.log(building.Table?.GlobalSecondaryIndexes?.[0]?.Backfilling); // true

// A query against the index now would be refused with
// "Cannot read from backfilling global secondary index: byStatus".
await simAws.backgroundTasksComplete();

// Once it is ACTIVE it answers for the order that was written before it existed.
const open = await dynamoDb.query(
  new QueryCommand({
    TableName: "OrdersTable",
    IndexName: "byStatus",
    KeyConditionExpression: "#status = :status",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: { ":status": { S: "OPEN" } },
  }),
);

console.log(open.Items?.[0]?.["orderId"]?.S); // "order-1"

// Removing it takes it back off the table.
await dynamoDb.updateTable(
  new UpdateTableCommand({
    TableName: "OrdersTable",
    GlobalSecondaryIndexUpdates: [{ Delete: { IndexName: "byStatus" } }],
  }),
);
await simAws.backgroundTasksComplete();

const described = await dynamoDb.describeTable(
  new DescribeTableCommand({ TableName: "OrdersTable" }),
);

console.log(described.Table?.GlobalSecondaryIndexes); // undefined
