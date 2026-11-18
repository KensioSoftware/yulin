/**
 * Querying and updating with the legacy parameters.
 */

import { QueryCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const dynamoDb = simAws.dynamoDb();

await dynamoDb.createTable({
  input: {
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
  },
});
await simAws.backgroundTasksComplete();

const key = { customerId: { S: "c-1" }, orderId: { S: "2026-01" } };

// ADD starts a missing number at 0, and PUT is the default action.
await dynamoDb.updateItem(
  new UpdateItemCommand({
    TableName: "OrdersTable",
    Key: key,
    AttributeUpdates: {
      total: { Action: "ADD", Value: { N: "12" } },
      status: { Value: { S: "OPEN" } },
    },
  }),
);

const output = await dynamoDb.query(
  new QueryCommand({
    TableName: "OrdersTable",
    KeyConditions: {
      customerId: {
        ComparisonOperator: "EQ",
        AttributeValueList: [{ S: "c-1" }],
      },
    },
    QueryFilter: {
      total: { ComparisonOperator: "GT", AttributeValueList: [{ N: "10" }] },
    },
    AttributesToGet: ["orderId", "total"],
  }),
);

console.log(output.Items);
// [ { orderId: { S: "2026-01" }, total: { N: "12" } } ]
