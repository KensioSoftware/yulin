/**
 * Writing and deleting items across two tables in one call.
 */

import {
  BatchWriteItemCommand,
  CreateTableCommand,
  GetItemCommand,
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

const written = await dynamoDb.batchWriteItem(
  new BatchWriteItemCommand({
    RequestItems: {
      OrdersTable: [
        {
          PutRequest: {
            Item: { orderId: { S: "order-1" }, total: { N: "19.99" } },
          },
        },
        {
          PutRequest: {
            Item: { orderId: { S: "order-2" }, total: { N: "24.99" } },
          },
        },
        { DeleteRequest: { Key: { orderId: { S: "order-0" } } } },
      ],
      CustomersTable: [
        { PutRequest: { Item: { customerId: { S: "customer-1" } } } },
      ],
    },
  }),
);

// Nothing here is throttled, so nothing is ever left unprocessed.
console.log(written.UnprocessedItems); // {}

const output = await dynamoDb.getItem(
  new GetItemCommand({
    TableName: "OrdersTable",
    Key: { orderId: { S: "order-2" } },
  }),
);

console.log(output.Item?.["total"]?.N); // "24.99"
