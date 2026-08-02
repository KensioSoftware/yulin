/**
 * Declaring and querying a local secondary index.
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
    TableName: "Orders",
    KeySchema: [
      { AttributeName: "customerId", KeyType: "HASH" },
      { AttributeName: "orderId", KeyType: "RANGE" },
    ],
    AttributeDefinitions: [
      { AttributeName: "customerId", AttributeType: "S" },
      { AttributeName: "orderId", AttributeType: "S" },
      { AttributeName: "placedAt", AttributeType: "S" },
    ],
    BillingMode: "PAY_PER_REQUEST",
    LocalSecondaryIndexes: [
      {
        IndexName: "OrdersByDate",
        // The partition key is the table's own. The sort key is the whole of
        // what the index adds.
        KeySchema: [
          { AttributeName: "customerId", KeyType: "HASH" },
          { AttributeName: "placedAt", KeyType: "RANGE" },
        ],
        Projection: { ProjectionType: "KEYS_ONLY" },
      },
    ],
  }),
);
await simAws.backgroundTasksComplete();

await dynamoDb.putItem(
  new PutItemCommand({
    TableName: "Orders",
    Item: {
      customerId: { S: "customer-1" },
      orderId: { S: "order-1" },
      placedAt: { S: "2026-03-19" },
      total: { N: "7" },
    },
  }),
);

await dynamoDb.putItem(
  new PutItemCommand({
    TableName: "Orders",
    Item: {
      customerId: { S: "customer-1" },
      orderId: { S: "order-2" },
      placedAt: { S: "2026-01-08" },
      total: { N: "42" },
    },
  }),
);

const byDate = await dynamoDb.query(
  new QueryCommand({
    TableName: "Orders",
    IndexName: "OrdersByDate",
    KeyConditionExpression: "customerId = :customerId",
    ExpressionAttributeValues: { ":customerId": { S: "customer-1" } },
    // The index sits in the same partition as the item it indexes, so it can
    // answer a strongly consistent read.
    ConsistentRead: true,
  }),
);

// In date order, which is not the order the table's own sort key gives.
console.log(byDate.Items?.[0]?.["orderId"]?.S); // "order-2"
console.log(byDate.Items?.[1]?.["orderId"]?.S); // "order-1"

// The index projects its keys alone, so `total` is not on what it answers with.
console.log(byDate.Items?.[0]?.["total"]); // undefined

const whole = await dynamoDb.query(
  new QueryCommand({
    TableName: "Orders",
    IndexName: "OrdersByDate",
    KeyConditionExpression: "customerId = :customerId",
    ExpressionAttributeValues: { ":customerId": { S: "customer-1" } },
    // Asking for whole items fetches what the index does not project from the
    // base table, which is the read AWS charges the extra capacity for.
    Select: "ALL_ATTRIBUTES",
  }),
);

console.log(whole.Items?.[0]?.["total"]?.N); // "42"
