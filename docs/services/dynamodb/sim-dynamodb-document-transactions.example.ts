/**
 * Writing an order and the claim on its code together, in plain JavaScript.
 */

import { CreateTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  TransactGetCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";

import { SimSdk } from "@kensio/yulin/sdk";

using simSdk = new SimSdk();

const documents = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: "eu-west-2" }),
);
simSdk.intercept(documents);

for (const [tableName, keyName] of [
  ["OrdersTable", "orderId"],
  ["ClaimsTable", "code"],
] as const) {
  await documents.send(
    new CreateTableCommand({
      TableName: tableName,
      KeySchema: [{ AttributeName: keyName, KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: keyName, AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST",
    }),
  );
}
await simSdk.simAws.backgroundTasksComplete();

const claim = {
  TableName: "ClaimsTable",
  ConditionExpression: "attribute_not_exists(code)",
};

// The order and the claim on its code go in together.
await documents.send(
  new TransactWriteCommand({
    TransactItems: [
      {
        Put: {
          TableName: "OrdersTable",
          Item: { orderId: "order-1", total: 42, lines: [{ sku: "widget" }] },
        },
      },
      { Put: { ...claim, Item: { code: "ABC123", orderId: "order-1" } } },
    ],
  }),
);

const read = await documents.send(
  new TransactGetCommand({
    TransactItems: [
      { Get: { TableName: "OrdersTable", Key: { orderId: "order-1" } } },
      { Get: { TableName: "ClaimsTable", Key: { code: "ABC123" } } },
    ],
  }),
);

const lines = read.Responses?.[0]?.Item?.["lines"] as { sku: string }[];
console.log(lines[0]?.sku); // widget
console.log(read.Responses?.[1]?.Item?.["orderId"]); // order-1

// A second order wanting the same code loses the claim, and loses the order
// with it.
try {
  await documents.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: "OrdersTable",
            Item: { orderId: "order-2", total: 7 },
          },
        },
        { Put: { ...claim, Item: { code: "ABC123", orderId: "order-2" } } },
      ],
    }),
  );
} catch (error) {
  const cancelled = error as {
    name: string;
    CancellationReasons?: { Code: string }[];
  };

  console.log(cancelled.name); // "TransactionCanceledException"
  console.log(cancelled.CancellationReasons?.map((reason) => reason.Code));
  // ["None", "ConditionalCheckFailed"]
}

const second = await documents.send(
  new TransactGetCommand({
    TransactItems: [
      { Get: { TableName: "OrdersTable", Key: { orderId: "order-2" } } },
    ],
  }),
);

console.log(second.Responses?.[0]); // {}
