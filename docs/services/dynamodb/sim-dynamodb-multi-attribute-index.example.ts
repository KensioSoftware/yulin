/**
 * Querying a global secondary index keyed by several attributes.
 */

import { QueryCommand } from "@aws-sdk/client-dynamodb";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const dynamoDb = simAws.dynamoDb();

await dynamoDb.createTable({
  input: {
    TableName: "OrdersTable",
    KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
    AttributeDefinitions: [
      { AttributeName: "orderId", AttributeType: "S" },
      { AttributeName: "region", AttributeType: "S" },
      { AttributeName: "warehouse", AttributeType: "S" },
      { AttributeName: "status", AttributeType: "S" },
      { AttributeName: "priority", AttributeType: "N" },
    ],
    BillingMode: "PAY_PER_REQUEST",
    GlobalSecondaryIndexes: [
      {
        IndexName: "byWarehouse",
        KeySchema: [
          { AttributeName: "region", KeyType: "HASH" },
          { AttributeName: "warehouse", KeyType: "HASH" },
          { AttributeName: "status", KeyType: "RANGE" },
          { AttributeName: "priority", KeyType: "RANGE" },
        ],
        Projection: { ProjectionType: "ALL" },
      },
    ],
  },
});
await simAws.backgroundTasksComplete();

const orders = [
  { orderId: "order-1", status: "OPEN", priority: "10" },
  { orderId: "order-2", status: "OPEN", priority: "9" },
  { orderId: "order-3", status: "SHIPPED", priority: "1" },
];

await Promise.all(
  orders.map(async ({ orderId, status, priority }) =>
    dynamoDb.putItem({
      input: {
        TableName: "OrdersTable",
        Item: {
          orderId: { S: orderId },
          region: { S: "north" },
          warehouse: { S: "w1" },
          status: { S: status },
          priority: { N: priority },
        },
      },
    }),
  ),
);

// Every partition key attribute is named with =. The sort key attributes are
// named from the left, and only the last one named may take a range.
const open = await dynamoDb.query(
  new QueryCommand({
    TableName: "OrdersTable",
    IndexName: "byWarehouse",
    KeyConditionExpression:
      "#region = :region AND warehouse = :warehouse AND " +
      "#status = :status AND priority < :priority",
    ExpressionAttributeNames: { "#region": "region", "#status": "status" },
    ExpressionAttributeValues: {
      ":region": { S: "north" },
      ":warehouse": { S: "w1" },
      ":status": { S: "OPEN" },
      ":priority": { N: "20" },
    },
  }),
);

// Items sort by status, then by priority as a number.
console.log(open.Items?.map((item) => item["orderId"]?.S)); // ["order-2", "order-1"]
