/**
 * Reading items from two tables in one call, projecting one of them.
 */

import {
  BatchGetItemCommand,
  CreateTableCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const dynamoDb = simAws.dynamoDb();

await dynamoDb.createTable(
  new CreateTableCommand({
    TableName: "OrdersTable",
    KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "orderId", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST",
  }),
);
await dynamoDb.createTable(
  new CreateTableCommand({
    TableName: "CustomersTable",
    KeySchema: [{ AttributeName: "customerId", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "customerId", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST",
  }),
);
await simAws.backgroundTasksComplete();

await dynamoDb.putItem(
  new PutItemCommand({
    TableName: "OrdersTable",
    Item: {
      orderId: { S: "order-1" },
      total: { N: "19.99" },
      note: { S: "gift wrapped" },
    },
  }),
);
await dynamoDb.putItem(
  new PutItemCommand({
    TableName: "CustomersTable",
    Item: { customerId: { S: "customer-1" }, name: { S: "Ada" } },
  }),
);

const output = await dynamoDb.batchGetItem(
  new BatchGetItemCommand({
    RequestItems: {
      OrdersTable: {
        Keys: [{ orderId: { S: "order-1" } }, { orderId: { S: "order-404" } }],
        ConsistentRead: true,
        ProjectionExpression: "total",
      },
      CustomersTable: {
        Keys: [{ customerId: { S: "customer-1" } }],
      },
    },
  }),
);

// The key that holds nothing is left out rather than standing in the answer.
console.log(output.Responses["OrdersTable"]?.length); // 1
console.log(output.Responses["OrdersTable"]?.[0]); // { total: { N: "19.99" } }
console.log(output.Responses["CustomersTable"]?.[0]?.["name"]?.S); // "Ada"
console.log(output.UnprocessedKeys); // {}
