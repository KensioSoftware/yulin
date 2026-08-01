/**
 * Reading and writing items as plain JavaScript with the document client.
 */

import { CreateTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

import { SimSdk } from "@kensio/yulin/sdk";

using simSdk = new SimSdk();

const documents = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: "eu-west-2" }),
);
simSdk.intercept(documents);

await documents.send(
  new CreateTableCommand({
    TableName: "OrdersTable",
    KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "orderId", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST",
  }),
);
await simSdk.simAws.backgroundTasksComplete();

// Nested objects, lists and Sets all go in as themselves.
await documents.send(
  new PutCommand({
    TableName: "OrdersTable",
    Item: {
      orderId: "order-1",
      total: 42,
      paid: false,
      lines: [{ sku: "widget", quantity: 2 }],
      tags: new Set(["priority", "gift"]),
    },
  }),
);

const updated = await documents.send(
  new UpdateCommand({
    TableName: "OrdersTable",
    Key: { orderId: "order-1" },
    UpdateExpression: "SET paid = :paid",
    ExpressionAttributeValues: { ":paid": true },
    ReturnValues: "ALL_NEW",
  }),
);

console.log(updated.Attributes?.["paid"]); // true

const read = await documents.send(
  new GetCommand({ TableName: "OrdersTable", Key: { orderId: "order-1" } }),
);

const lines = read.Item?.["lines"] as { sku: string; quantity: number }[];
console.log(lines[0]?.quantity); // 2

const tags = read.Item?.["tags"] as Set<string>;
console.log(tags.has("priority")); // true
