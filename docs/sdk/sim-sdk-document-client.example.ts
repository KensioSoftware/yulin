/**
 * An intercepted DynamoDB document client, writing plain JavaScript values.
 */

import { CreateTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";

import { SimSdk } from "@kensio/yulin/sdk";

using simSdk = new SimSdk();

const documents = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: "eu-west-2" }),
);

// The document client is what gets intercepted, not the client it was built
// from.
simSdk.intercept(documents);

// A document client forwards a Command it has no document form of, so the
// table is created through the same client.
await documents.send(
  new CreateTableCommand({
    TableName: "OrdersTable",
    KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "orderId", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST",
  }),
);
await simSdk.simAws.backgroundTasksComplete();

await documents.send(
  new PutCommand({
    TableName: "OrdersTable",
    Item: { orderId: "order-1", total: 42, paid: true },
  }),
);

const read = await documents.send(
  new GetCommand({ TableName: "OrdersTable", Key: { orderId: "order-1" } }),
);

console.log(read.Item?.["total"]); // 42
console.log(read.Item?.["paid"]); // true
