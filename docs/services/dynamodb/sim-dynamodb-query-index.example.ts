/**
 * Querying a global secondary index.
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
    KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
    AttributeDefinitions: [
      { AttributeName: "orderId", AttributeType: "S" },
      { AttributeName: "status", AttributeType: "S" },
    ],
    BillingMode: "PAY_PER_REQUEST",
    GlobalSecondaryIndexes: [
      {
        IndexName: "byStatus",
        KeySchema: [{ AttributeName: "status", KeyType: "HASH" }],
        Projection: { ProjectionType: "INCLUDE", NonKeyAttributes: ["total"] },
      },
    ],
  }),
);
await simAws.backgroundTasksComplete();

await dynamoDb.putItem(
  new PutItemCommand({
    TableName: "OrdersTable",
    Item: {
      orderId: { S: "order-1" },
      status: { S: "OPEN" },
      total: { N: "42" },
      note: { S: "Gift wrap" },
    },
  }),
);

// A draft carries no status, so the index does not hold it.
await dynamoDb.putItem(
  new PutItemCommand({
    TableName: "OrdersTable",
    Item: { orderId: { S: "order-2" }, total: { N: "7" } },
  }),
);

const open = await dynamoDb.query(
  new QueryCommand({
    TableName: "OrdersTable",
    IndexName: "byStatus",
    KeyConditionExpression: "#status = :status",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: { ":status": { S: "OPEN" } },
  }),
);

console.log(open.Count); // 1
console.log(open.Items?.[0]?.["orderId"]?.S); // "order-1"
console.log(open.Items?.[0]?.["total"]?.N); // "42"

// `note` is not projected, so it is not on the item the index answers with.
console.log(open.Items?.[0]?.["note"]); // undefined
